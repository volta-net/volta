import { streamText, convertToModelMessages, stepCountIs, smoothStream, jsonSchema } from 'ai'
import { and, inArray, eq, desc, ilike, or, sql, gte, isNull } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import { analyzeAndStoreResolution } from '../utils/resolution'

type JSONValue = null | string | number | boolean | { [key: string]: JSONValue | undefined } | JSONValue[]
type ProviderOptions = Record<string, Record<string, JSONValue | undefined>>

function getProviderOptions(model: string): ProviderOptions | undefined {
  const gateway = { caching: 'auto' }

  switch (model) {
    case 'anthropic/claude-opus-4.6':
    case 'anthropic/claude-sonnet-4.6':
      return { anthropic: { thinking: { type: 'adaptive' }, effort: 'low' }, gateway }
    case 'anthropic/claude-haiku-4.5':
      return { anthropic: { thinking: { type: 'enabled', budgetTokens: 2048 } }, gateway }
    case 'openai/gpt-5.4':
    case 'openai/gpt-5.4-mini':
    case 'openai/gpt-5.4-nano':
      return { openai: { reasoningEffort: 'low', reasoningSummary: 'detailed' }, gateway }
    case 'google/gemini-3.1-pro-preview':
    case 'google/gemini-3-flash':
      return { google: { thinkingConfig: { includeThoughts: true, thinkingLevel: 'low' } }, gateway }
    default:
      return undefined
  }
}

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const { messages } = await readBody(event)

  if (!messages || !Array.isArray(messages)) {
    throw createError({ statusCode: 400, message: 'Invalid or missing messages array.' })
  }

  const { token, model } = await getUserAiSettings(user.id)
  const gateway = createUserGateway(token)

  if (!gateway) {
    throw createError({
      statusCode: 403,
      message: 'Vercel AI Gateway token not configured. Add your token in Settings > AI to enable the assistant.'
    })
  }

  // Subqueries for scoping data to user's accessible repositories
  const accessibleRepoIds = db
    .select({ repositoryId: schema.repositoryCollaborators.repositoryId })
    .from(schema.repositoryCollaborators)
    .where(eq(schema.repositoryCollaborators.userId, user.id))

  const favoriteRepoIds = getUserFavoriteRepoIdsSubquery(user.id)

  const searchIssues = {
    description: `Search issues and pull requests with flexible filters. All parameters are optional — combine them to build precise queries.
Examples: find open issues with label "bug", find PRs by a specific author, find issues with linked PRs, find unassigned issues, find issues with no comments, etc.`,
    inputSchema: jsonSchema<{
      query?: string
      state?: string
      type?: string
      repository?: string
      label?: string
      author?: string
      assignee?: string
      resolutionStatus?: string
      hasLinkedPrs?: boolean
      hasComments?: boolean
      draft?: boolean
      merged?: boolean
      sort?: string
      limit?: number
    }>({
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Text to match against issue/PR titles. Also matches issue numbers.' },
        state: { type: 'string', enum: ['open', 'closed'], description: 'Filter by state' },
        type: { type: 'string', enum: ['issue', 'pr'], description: 'Filter by type' },
        repository: { type: 'string', description: 'Repository full name (e.g., "nuxt/ui")' },
        label: { type: 'string', description: 'Filter by label name' },
        author: { type: 'string', description: 'Filter by author username' },
        assignee: { type: 'string', description: 'Filter by assignee username. Use "none" for unassigned.' },
        resolutionStatus: { type: 'string', enum: ['answered', 'likely_resolved', 'waiting_on_author', 'needs_attention'], description: 'Filter by AI resolution status (issues only)' },
        suggestedAction: { type: 'string', enum: ['close_resolved', 'close_not_planned', 'close_duplicate', 'ask_reproduction', 'respond', 'none'], description: 'Filter by AI suggested action (issues only)' },
        hasLinkedPrs: { type: 'boolean', description: 'If true, only issues that have linked PRs. If false, only issues without linked PRs.' },
        hasComments: { type: 'boolean', description: 'If true, only items with comments. If false, only items with zero comments.' },
        draft: { type: 'boolean', description: 'Filter PRs by draft status' },
        merged: { type: 'boolean', description: 'Filter PRs by merged status' },
        sort: { type: 'string', enum: ['updated', 'created', 'comments', 'reactions'], description: 'Sort order (default "updated")' },
        limit: { type: 'number', description: 'Max results (default 15, max 30)' }
      }
    }),
    execute: async (params: {
      query?: string
      state?: string
      type?: string
      repository?: string
      label?: string
      author?: string
      assignee?: string
      resolutionStatus?: string
      suggestedAction?: string
      hasLinkedPrs?: boolean
      hasComments?: boolean
      draft?: boolean
      merged?: boolean
      sort?: string
      limit?: number
    }) => {
      const maxResults = Math.min(params.limit || 15, 30)
      const conditions: ReturnType<typeof eq>[] = []

      // Repo scope (default to favorite repositories)
      if (params.repository) {
        const repo = await db.query.repositories.findFirst({
          where: and(
            eq(schema.repositories.fullName, params.repository),
            inArray(schema.repositories.id, accessibleRepoIds)
          )
        })
        if (!repo) return { error: 'Repository not found or not accessible' }
        conditions.push(eq(schema.issues.repositoryId, repo.id))
      } else {
        conditions.push(inArray(schema.issues.repositoryId, favoriteRepoIds))
      }

      // State
      if (params.state) {
        conditions.push(eq(schema.issues.state, params.state))
      }

      // Type
      if (params.type === 'issue') {
        conditions.push(eq(schema.issues.pullRequest, false))
      } else if (params.type === 'pr') {
        conditions.push(eq(schema.issues.pullRequest, true))
      }

      // Text search
      if (params.query) {
        const isNumeric = /^\d+$/.test(params.query)
        if (isNumeric) {
          conditions.push(or(
            sql`CAST(${schema.issues.number} AS TEXT) LIKE ${params.query + '%'}`,
            ilike(schema.issues.title, `%${params.query}%`)
          )!)
        } else {
          conditions.push(ilike(schema.issues.title, `%${params.query}%`))
        }
      }

      // Author
      if (params.author) {
        const authorUser = await db.query.users.findFirst({
          where: eq(schema.users.login, params.author)
        })
        if (authorUser) {
          conditions.push(eq(schema.issues.userId, authorUser.id))
        }
      }

      // Resolution status
      if (params.resolutionStatus) {
        conditions.push(eq(schema.issues.resolutionStatus, params.resolutionStatus as any))
      }
      if (params.suggestedAction) {
        conditions.push(eq(schema.issues.resolutionSuggestedAction, params.suggestedAction as any))
      }

      // PR-specific filters
      if (params.draft !== undefined) {
        conditions.push(eq(schema.issues.draft, params.draft))
      }
      if (params.merged !== undefined) {
        conditions.push(eq(schema.issues.merged, params.merged))
      }

      // Comment filter
      if (params.hasComments === true) {
        conditions.push(sql`${schema.issues.commentCount} > 0`)
      } else if (params.hasComments === false) {
        conditions.push(eq(schema.issues.commentCount, 0))
      }

      // Sort
      const sortMap = {
        updated: desc(schema.issues.updatedAt),
        created: desc(schema.issues.createdAt),
        comments: desc(schema.issues.commentCount),
        reactions: desc(schema.issues.reactionCount)
      }
      const orderBy = sortMap[params.sort as keyof typeof sortMap] ?? sortMap.updated

      const hasPostFilters = params.label || params.assignee || params.hasLinkedPrs !== undefined
      const fetchLimit = hasPostFilters ? maxResults * 3 : maxResults

      const issues = await db.query.issues.findMany({
        where: and(...conditions),
        orderBy,
        limit: fetchLimit,
        with: {
          repository: { columns: { id: true, fullName: true } },
          labels: { with: { label: { columns: { name: true, color: true } } } },
          user: { columns: { login: true } },
          assignees: { with: { user: { columns: { login: true } } } },
          linkedPrs: { with: { pr: { columns: { number: true, state: true } } } }
        },
        columns: {
          id: true,
          number: true,
          title: true,
          state: true,
          stateReason: true,
          pullRequest: true,
          draft: true,
          merged: true,
          htmlUrl: true,
          commentCount: true,
          reactionCount: true,
          resolutionStatus: true,
          resolutionSuggestedAction: true,
          resolutionDraftReply: true,
          resolutionDuplicateOf: true,
          resolutionReasoning: true,
          resolutionConfidence: true,
          createdAt: true,
          updatedAt: true
        }
      })

      // Post-query filters that require joins
      let filtered = issues

      // Label filter
      if (params.label) {
        const labelLower = params.label.toLowerCase()
        filtered = filtered.filter(i => i.labels.some(l => l.label.name.toLowerCase() === labelLower))
      }

      // Assignee filter
      if (params.assignee === 'none') {
        filtered = filtered.filter(i => i.assignees.length === 0)
      } else if (params.assignee) {
        filtered = filtered.filter(i => i.assignees.some(a => a.user?.login === params.assignee))
      }

      // Linked PRs filter
      if (params.hasLinkedPrs === true) {
        filtered = filtered.filter(i => i.linkedPrs.length > 0)
      } else if (params.hasLinkedPrs === false) {
        filtered = filtered.filter(i => i.linkedPrs.length === 0)
      }

      return filtered.slice(0, maxResults).map(issue => ({
        number: issue.number,
        title: issue.title,
        state: issue.state,
        stateReason: issue.stateReason,
        type: issue.pullRequest ? 'pr' : 'issue',
        draft: issue.draft,
        merged: issue.merged,
        repository: issue.repository.fullName,
        author: issue.user?.login,
        assignees: issue.assignees.map(a => a.user?.login).filter(Boolean),
        labels: issue.labels.map(l => ({ name: l.label.name, color: l.label.color })),
        linkedPrs: issue.linkedPrs.map(lp => ({ number: lp.pr.number, state: lp.pr.state })),
        comments: issue.commentCount,
        reactions: issue.reactionCount,
        resolutionStatus: issue.resolutionStatus,
        suggestedAction: issue.resolutionSuggestedAction,
        draftReply: issue.resolutionDraftReply ? issue.resolutionDraftReply.slice(0, 500) : null,
        duplicateOf: issue.resolutionDuplicateOf,
        reasoning: issue.resolutionReasoning,
        confidence: issue.resolutionConfidence,
        url: issue.htmlUrl,
        createdAt: issue.createdAt,
        updatedAt: issue.updatedAt
      }))
    }
  }

  const getNotifications = {
    description: 'Get the user\'s notifications. Can filter to unread only. Returns notification type, action, repository, issue/PR details, and read status.',
    inputSchema: jsonSchema<{ unreadOnly?: boolean, limit?: number }>({
      type: 'object' as const,
      properties: {
        unreadOnly: { type: 'boolean', description: 'Only return unread notifications (default false)' },
        limit: { type: 'number', description: 'Max results (default 20, max 50)' }
      }
    }),
    execute: async ({ unreadOnly, limit }: { unreadOnly?: boolean, limit?: number }) => {
      const maxResults = Math.min(limit || 20, 50)
      const conditions = [eq(schema.notifications.userId, user.id)]

      if (unreadOnly) {
        conditions.push(eq(schema.notifications.read, false))
      }

      const notifications = await db.query.notifications.findMany({
        where: and(...conditions),
        orderBy: desc(schema.notifications.createdAt),
        limit: maxResults,
        with: {
          repository: { columns: { fullName: true } },
          issue: { columns: { number: true, title: true, state: true, pullRequest: true, htmlUrl: true } },
          actor: { columns: { login: true } }
        }
      })

      return notifications.map(n => ({
        type: n.type,
        action: n.action,
        read: n.read,
        repository: n.repository?.fullName,
        issue: n.issue
          ? {
              number: n.issue.number,
              title: n.issue.title,
              state: n.issue.state,
              type: n.issue.pullRequest ? 'pr' : 'issue',
              url: n.issue.htmlUrl
            }
          : null,
        actor: n.actor?.login,
        createdAt: n.createdAt
      }))
    }
  }

  const getIssueStats = {
    description: 'Get statistics for issues and/or pull requests: total open/closed counts, resolution status breakdown, and weekly trends. Can scope to a specific repository or all favorite repositories.',
    inputSchema: jsonSchema<{ type?: string, repository?: string, weeks?: number }>({
      type: 'object' as const,
      properties: {
        type: { type: 'string', enum: ['issue', 'pr', 'all'], description: 'Filter by type: "issue" for issues only, "pr" for pull requests only, "all" for both (default "issue")' },
        repository: { type: 'string', description: 'Repository full name (e.g., "nuxt/ui"). If omitted, uses all favorite repositories.' },
        weeks: { type: 'number', description: 'Number of weeks for trend data (default 12, max 52)' }
      }
    }),
    execute: async ({ type, repository, weeks }: { type?: string, repository?: string, weeks?: number }) => {
      const numWeeks = Math.min(weeks || 12, 52)
      const filterType = type || 'issue'

      // Determine repo scope
      let repoScope
      if (repository) {
        const repo = await db.query.repositories.findFirst({
          where: and(
            eq(schema.repositories.fullName, repository),
            inArray(schema.repositories.id, accessibleRepoIds)
          )
        })
        if (!repo) return { error: 'Repository not found or not accessible' }
        repoScope = eq(schema.issues.repositoryId, repo.id)
      } else {
        repoScope = inArray(schema.issues.repositoryId, favoriteRepoIds)
      }

      // Type filter
      const typeConditions = filterType === 'all'
        ? []
        : [eq(schema.issues.pullRequest, filterType === 'pr')]

      const totals = await db
        .select({
          state: schema.issues.state,
          count: sql<number>`count(*)`
        })
        .from(schema.issues)
        .where(and(repoScope, ...typeConditions))
        .groupBy(schema.issues.state)

      const totalOpen = totals.find(t => t.state === 'open')?.count ?? 0
      const totalClosed = totals.find(t => t.state === 'closed')?.count ?? 0

      // Resolution breakdown (only for issues, not PRs)
      let resolution: Record<string, number> | undefined
      let actionBreakdown: Record<string, number> | undefined
      if (filterType !== 'pr') {
        const resolutionStats = await db
          .select({
            status: schema.issues.resolutionStatus,
            count: sql<number>`count(*)`
          })
          .from(schema.issues)
          .where(and(
            repoScope,
            eq(schema.issues.pullRequest, false),
            eq(schema.issues.state, 'open')
          ))
          .groupBy(schema.issues.resolutionStatus)

        resolution = {
          answered: 0,
          likely_resolved: 0,
          waiting_on_author: 0,
          needs_attention: 0,
          unanalyzed: 0
        }

        for (const stat of resolutionStats) {
          if (stat.status && stat.status in resolution) {
            resolution[stat.status] = stat.count
          } else {
            resolution.unanalyzed = (resolution.unanalyzed || 0) + stat.count
          }
        }

        const actionStats = await db
          .select({
            action: schema.issues.resolutionSuggestedAction,
            count: sql<number>`count(*)`
          })
          .from(schema.issues)
          .where(and(
            repoScope,
            eq(schema.issues.pullRequest, false),
            eq(schema.issues.state, 'open')
          ))
          .groupBy(schema.issues.resolutionSuggestedAction)

        actionBreakdown = {
          close_resolved: 0,
          close_not_planned: 0,
          close_duplicate: 0,
          ask_reproduction: 0,
          respond: 0,
          none: 0,
          unanalyzed: 0
        }

        for (const stat of actionStats) {
          if (stat.action && stat.action in actionBreakdown) {
            actionBreakdown[stat.action] = stat.count
          } else {
            actionBreakdown.unanalyzed = (actionBreakdown.unanalyzed || 0) + stat.count
          }
        }
      }

      // Weekly trend: count issues opened and closed during the period
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - numWeeks * 7)

      const [openedCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(schema.issues)
        .where(and(
          repoScope,
          ...typeConditions,
          gte(schema.issues.createdAt, startDate)
        ))

      const [closedCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(schema.issues)
        .where(and(
          repoScope,
          ...typeConditions,
          gte(schema.issues.closedAt, startDate)
        ))

      return {
        type: filterType,
        repository: repository || 'all favorites',
        totals: { open: totalOpen, closed: totalClosed },
        ...(resolution ? { resolution } : {}),
        ...(actionBreakdown ? { suggestedActions: actionBreakdown } : {}),
        recentActivity: {
          weeks: numWeeks,
          opened: openedCount?.count ?? 0,
          closed: closedCount?.count ?? 0
        }
      }
    }
  }

  const getIssueDetails = {
    description: 'Get detailed information about a specific issue or pull request including body, comments, labels, assignees, and resolution status. Use when the user asks about a specific issue.',
    inputSchema: jsonSchema<{ repository: string, number: number }>({
      type: 'object' as const,
      properties: {
        repository: { type: 'string', description: 'Repository full name (e.g., "owner/name")' },
        number: { type: 'number', description: 'Issue or PR number' }
      },
      required: ['repository', 'number']
    }),
    execute: async ({ repository, number }: { repository: string, number: number }) => {
      const repo = await db.query.repositories.findFirst({
        where: and(
          eq(schema.repositories.fullName, repository),
          inArray(schema.repositories.id, accessibleRepoIds)
        )
      })

      if (!repo) return { error: 'Repository not found or not accessible' }

      const issue = await db.query.issues.findFirst({
        where: and(
          eq(schema.issues.repositoryId, repo.id),
          eq(schema.issues.number, number)
        ),
        with: {
          user: { columns: { login: true } },
          assignees: { with: { user: { columns: { login: true } } } },
          labels: { with: { label: { columns: { name: true } } } },
          comments: {
            with: { user: { columns: { login: true } } },
            orderBy: (comments, { asc }) => [asc(comments.createdAt)],
            limit: 25
          }
        }
      })

      if (!issue) return { error: 'Issue not found' }

      return {
        number: issue.number,
        title: issue.title,
        body: issue.body?.slice(0, 3000),
        state: issue.state,
        stateReason: issue.stateReason,
        type: issue.pullRequest ? 'pr' : 'issue',
        author: issue.user?.login,
        assignees: issue.assignees.map(a => a.user?.login).filter(Boolean),
        labels: issue.labels.map(l => l.label.name),
        resolutionStatus: issue.resolutionStatus,
        suggestedAction: issue.resolutionSuggestedAction,
        draftReply: issue.resolutionDraftReply,
        duplicateOf: issue.resolutionDuplicateOf,
        reasoning: issue.resolutionReasoning,
        confidence: issue.resolutionConfidence,
        commentCount: issue.commentCount,
        reactionCount: issue.reactionCount,
        createdAt: issue.createdAt,
        updatedAt: issue.updatedAt,
        closedAt: issue.closedAt,
        url: issue.htmlUrl,
        comments: issue.comments.map(c => ({
          author: c.user?.login,
          body: c.body.slice(0, 1000),
          createdAt: c.createdAt
        }))
      }
    }
  }

  const listRepositories = {
    description: 'List all synced repositories the user collaborates on. Each repo has an isFavorite flag. Search tools default to favorite repos when no repo is specified. Use to see which repos are available and which are favorited.',
    inputSchema: jsonSchema<Record<string, never>>({
      type: 'object' as const,
      properties: {}
    }),
    execute: async () => {
      const repositories = await db.query.repositories.findMany({
        where: inArray(schema.repositories.id, accessibleRepoIds),
        columns: {
          id: true,
          fullName: true,
          description: true,
          private: true
        },
        orderBy: (repos, { asc }) => [asc(repos.fullName)]
      })

      const favIds = new Set(await getUserFavoriteRepoIds(user.id))

      return repositories.map(r => ({
        name: r.fullName,
        description: r.description,
        private: r.private,
        isFavorite: favIds.has(r.id)
      }))
    }
  }

  const manageFavorites = {
    description: 'Add or remove a repository from the user\'s favorites. Favorite repos are the default scope for search, stats, and analysis tools.',
    inputSchema: jsonSchema<{ action: 'add' | 'remove', repository: string }>({
      type: 'object' as const,
      properties: {
        action: { type: 'string', enum: ['add', 'remove'], description: 'Whether to add or remove the repository from favorites' },
        repository: { type: 'string', description: 'Repository full name (e.g., "owner/name")' }
      },
      required: ['action', 'repository']
    }),
    execute: async ({ action, repository }: { action: 'add' | 'remove', repository: string }) => {
      const repo = await db.query.repositories.findFirst({
        where: and(
          eq(schema.repositories.fullName, repository),
          inArray(schema.repositories.id, accessibleRepoIds)
        )
      })

      if (!repo) return { error: 'Repository not found or not accessible' }

      if (action === 'add') {
        const existing = await db.query.favoriteRepositories.findFirst({
          where: and(
            eq(schema.favoriteRepositories.userId, user.id),
            eq(schema.favoriteRepositories.repositoryId, repo.id)
          )
        })

        if (existing) return { success: true, message: `${repository} is already in favorites` }

        await db.insert(schema.favoriteRepositories).values({
          userId: user.id,
          repositoryId: repo.id
        })

        return { success: true, message: `Added ${repository} to favorites` }
      } else {
        await db.delete(schema.favoriteRepositories).where(and(
          eq(schema.favoriteRepositories.userId, user.id),
          eq(schema.favoriteRepositories.repositoryId, repo.id)
        ))

        return { success: true, message: `Removed ${repository} from favorites` }
      }
    }
  }

  const analyzeIssues = {
    description: 'Trigger AI resolution analysis on unanalyzed open issues. Use when the user wants to analyze issues that haven\'t been processed yet, or when stats show unanalyzed issues. Returns analysis results for each issue processed.',
    inputSchema: jsonSchema<{ repository?: string, limit?: number }>({
      type: 'object' as const,
      properties: {
        repository: { type: 'string', description: 'Repository full name (e.g., "owner/name"). If omitted, analyzes across all favorite repositories.' },
        limit: { type: 'number', description: 'Max issues to analyze (default 10, max 25)' }
      }
    }),
    execute: async ({ repository, limit }: { repository?: string, limit?: number }) => {
      const maxIssues = Math.min(limit || 10, 25)

      const conditions = [
        eq(schema.issues.pullRequest, false),
        eq(schema.issues.state, 'open'),
        or(
          isNull(schema.issues.resolutionAnalyzedAt),
          isNull(schema.issues.resolutionSuggestedAction)
        )
      ]

      if (repository) {
        const repo = await db.query.repositories.findFirst({
          where: and(
            eq(schema.repositories.fullName, repository),
            inArray(schema.repositories.id, accessibleRepoIds)
          )
        })
        if (!repo) return { error: 'Repository not found or not accessible' }
        conditions.push(eq(schema.issues.repositoryId, repo.id))
      } else {
        conditions.push(inArray(schema.issues.repositoryId, favoriteRepoIds))
      }

      const [totalUnanalyzed] = await db
        .select({ count: sql<number>`count(*)` })
        .from(schema.issues)
        .where(and(...conditions))

      const issues = await db.query.issues.findMany({
        where: and(...conditions),
        columns: { id: true, number: true, title: true },
        with: { repository: { columns: { fullName: true } } },
        orderBy: desc(schema.issues.updatedAt),
        limit: maxIssues
      })

      if (!issues.length) {
        return { analyzed: 0, remaining: 0, message: 'No unanalyzed issues found.' }
      }

      const results = []
      for (const issue of issues) {
        try {
          const result = await analyzeAndStoreResolution(issue.id, gateway, model)
          results.push({
            number: issue.number,
            title: issue.title,
            repository: issue.repository.fullName,
            status: result?.status ?? 'failed',
            confidence: result?.confidence ?? 0,
            suggestedAction: result?.suggestedAction ?? null,
            draftReply: result?.draftReply?.slice(0, 500) ?? null,
            reasoning: result?.reasoning ?? null
          })
        } catch {
          results.push({
            number: issue.number,
            title: issue.title,
            repository: issue.repository.fullName,
            status: 'error',
            confidence: 0,
            suggestedAction: null,
            draftReply: null,
            reasoning: null
          })
        }
      }

      return {
        analyzed: results.length,
        remaining: Math.max(0, (totalUnanalyzed?.count ?? 0) - results.length),
        results
      }
    }
  }

  const generateChart = {
    description: `Generate a chart to visualize data inline in the conversation.
Chart types:
- "donut": proportions/percentages (uses "data" array of {label, value, color?})
- "bar": categorical comparisons (uses "xLabels" + "series")
- "line": trends over time (uses "xLabels" + "series")
- "area": trends with filled area (uses "xLabels" + "series")
For bar/line/area, provide xLabels for the x-axis and series for each data line/bar group.`,
    inputSchema: jsonSchema<{
      type: 'donut' | 'bar' | 'line' | 'area'
      title: string
      data?: Array<{ label: string, value: number, color?: string }>
      xLabels?: string[]
      series?: Array<{ name: string, color: string, values: number[] }>
    }>({
      type: 'object' as const,
      properties: {
        type: { type: 'string', enum: ['donut', 'bar', 'line', 'area'], description: 'Chart type' },
        title: { type: 'string', description: 'Short descriptive chart title' },
        data: {
          type: 'array',
          description: 'Data points for donut charts only',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string', description: 'Segment label' },
              value: { type: 'number', description: 'Numeric value' },
              color: { type: 'string', description: 'Hex color (e.g., "#3b82f6")' }
            },
            required: ['label', 'value']
          }
        },
        xLabels: {
          type: 'array',
          description: 'X-axis labels for bar/line/area charts',
          items: { type: 'string' }
        },
        series: {
          type: 'array',
          description: 'Data series for bar/line/area charts. Each series has a name, color, and values array matching xLabels length.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Series name' },
              color: { type: 'string', description: 'Hex color' },
              values: { type: 'array', items: { type: 'number' }, description: 'Values for each xLabel' }
            },
            required: ['name', 'color', 'values']
          }
        }
      },
      required: ['type', 'title']
    }),
    execute: async (input: {
      type: 'donut' | 'bar' | 'line' | 'area'
      title: string
      data?: Array<{ label: string, value: number, color?: string }>
      xLabels?: string[]
      series?: Array<{ name: string, color: string, values: number[] }>
    }) => {
      return input
    }
  }

  const system = `You are Volta, an AI assistant for open-source maintainers. You help users understand and manage their GitHub issues, pull requests, and notifications.

The user's GitHub username is "${user.username}".

**FORMATTING RULES:**
- Never use markdown headings (#, ##, ###). Use **bold text** for section labels instead.
- Never use horizontal rules (---). Use **bold text** or spacing to separate sections.
- Be concise and direct.
- Use bullet points and short paragraphs for readability.
- NEVER list issues or PRs as plain text bullets (e.g., "- #123 title"). Instead, use the ::issue Comark block component.
- ALWAYS use block syntax (NOT inline) for issue components — they render as cards and must be outside of paragraphs and lists:

::issue{number="123" repo="owner/name" title="Issue title" state="open" type="issue" url="https://github.com/..." comments="5" labels="bug:d73a4a,enhancement:a2eeef" author="user"}
::

- NEVER place ::issue components inside bullet points or list items. End the list first, then place the issue blocks, then continue with more text or a new list.
- Supported attributes: number (required), repo (required), title (required), state ("open"/"closed"), type ("issue"/"pr"), url (the GitHub URL), comments (count), reactions (count), labels (comma-separated "name:color" pairs, e.g. "bug:d73a4a,enhancement:a2eeef"), author (username), draft, merged, stateReason ("not_planned" etc.)
- Structure your response as: text analysis with bullet points for insights, then ::issue blocks for the relevant issues, then more text. Example:

**Bugs worth fixing:**

These tooltip-related issues have the most community engagement:

::issue{number="4378" repo="nuxt/ui" title="Tooltip cannot be triggered after page scrolling" state="open" type="issue" url="https://github.com/nuxt/ui/issues/4378" comments="3" reactions="5" labels="bug:d73a4a" author="ben"}
::

::issue{number="3599" repo="nuxt/ui" title="Switch inside a Tooltip loses styling" state="open" type="issue" url="https://github.com/nuxt/ui/issues/3599" comments="1" reactions="2" labels="bug:d73a4a,styling:c5def5" author="john"}
::

Both are related to the Tooltip component and could be fixed together.

- When discussing search results, highlight the most important issues with ::issue blocks and summarize the rest in text. Don't duplicate the full tool result list — the user already sees a rich list from tool results.

**REPOSITORIES:**
- The user has "synced" repositories (all repos they collaborate on) and "favorite" repositories (a user-curated subset).
- The Volta app only displays issues and PRs from **favorite** repositories. Search, stats, and analysis tools also default to favorite repos when no specific repository is given.
- Use listRepositories to see all synced repos — each has an isFavorite flag.
- Use manageFavorites to add or remove repos from favorites when the user asks.
- If the user asks about a repo that isn't favorited, you can still search it by name, or suggest adding it to favorites so its issues and PRs appear in the app.

**RESOLUTION ANALYSIS:**
Issues have AI-powered resolution analysis with two layers:
- **resolutionStatus**: overall classification — "answered", "likely_resolved", "waiting_on_author", "needs_attention"
- **suggestedAction**: concrete next step — "close_resolved", "close_not_planned", "close_duplicate", "ask_reproduction", "respond", "none"
- **draftReply**: a pre-written reply the user can review and post
- **duplicateOf**: issue number this is a duplicate of (when suggestedAction is "close_duplicate")
- **reasoning**: explanation of why the AI chose this action
- **confidence**: 0-100 confidence score

When discussing analyzed issues, mention the suggestedAction and reasoning — they are more actionable than resolutionStatus alone. You can filter issues by suggestedAction to find, for example, all issues ready to close or all that need a response.

**BEHAVIOR:**
- Use your tools to look up real data before answering questions about issues, PRs, or notifications.
- When a question is ambiguous about which repository, list the user's repositories first or ask for clarification.
- Provide actionable insights: highlight issues needing attention, stale issues, or patterns in the data.
- When summarizing notifications, group them by type or repository for clarity.
- When issue stats show unanalyzed issues, proactively suggest using the analyzeIssues tool to process them.
- When analysis results include suggestedAction and draftReply, present them clearly so the user can quickly act.
- If you cannot find relevant data, say so clearly.

**CHARTS:**
- Only generate a chart when the user explicitly asks for a visual, comparison, or breakdown — or when the data has 3+ categories that are hard to compare in text (e.g., resolution status breakdown across 5 statuses, weekly trends over many weeks).
- Do NOT generate a chart for simple two-number comparisons like "120 open, 340 closed" — just state those in text.
- Chart types: "donut" for proportions, "bar" for categorical comparisons, "line" for trends over time, "area" for volume over time.
- Always pick distinct, accessible hex colors for each data point.
- Call generateChart AFTER the data-fetching tool call, using the data you received.`

  return streamText({
    model: gateway(model),
    system,
    messages: await convertToModelMessages(messages),
    providerOptions: getProviderOptions(model),
    experimental_transform: smoothStream(),
    stopWhen: stepCountIs(8),
    tools: {
      searchIssues,
      getNotifications,
      getIssueStats,
      getIssueDetails,
      listRepositories,
      manageFavorites,
      analyzeIssues,
      generateChart
    }
  }).toUIMessageStreamResponse()
})
