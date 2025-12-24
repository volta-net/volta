import { and, inArray, notInArray, eq, desc, ilike, sql, gt, isNull } from 'drizzle-orm'
import { db, schema } from 'hub:db'
import { getLinkedPRsForIssues, getCIStatusForPRs } from '../utils/issues'

/**
 * Flexible issues endpoint with query parameter filters
 *
 * Query params:
 * - pullRequest: 'true' | 'false' - filter by PR or issue
 * - state: 'open' | 'closed' - filter by state
 * - author: 'me' | number - filter by author (current user or user ID)
 * - authorIsBot: 'true' | 'false' - filter by bot authors (for dependency updates)
 * - assignee: 'me' | number - filter by assignee (current user or user ID)
 * - reviewRequested: 'me' | number - filter by requested reviewer (current user or user ID)
 * - hasLinkedPr: 'true' | 'false' - has linked PRs or not
 * - hasMaintainerComment: 'true' | 'false' - has maintainer comment or not
 * - draft: 'true' | 'false' - filter by draft status (PRs only)
 * - merged: 'true' | 'false' - filter by merged status (PRs only)
 * - isApproved: 'true' | 'false' - has approved review without changes requested (PRs only)
 * - hasChangesRequested: 'true' | 'false' - has changes requested review (PRs only)
 * - hasRequestedReviewers: 'true' | 'false' - has pending review requests (PRs only)
 * - ciPassing: 'true' | 'false' - CI checks are passing (PRs only)
 * - excludeBotWithPassingCi: 'true' - exclude bot PRs that have passing CI (for needs review)
 * - isBug: 'true' | 'false' - has bug label/type
 * - hasLabels: 'true' | 'false' - has any labels or not
 * - hasType: 'true' | 'false' - has issue type or not
 * - excludeBots: 'true' | 'false' - exclude bot-created issues
 * - hasLabel: string - filter by label name (partial match)
 * - excludeLabel: string - exclude by label name (partial match)
 * - minEngagement: number - minimum reactions + comments
 * - sort: 'updated' | 'created' | 'engagement' - sort order
 * - limit: number - max results (default 100)
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const query = getQuery(event)

  const favoriteRepoIdsSubquery = getUserFavoriteRepoIdsSubquery(user!.id)

  // Parse query parameters
  const pullRequest = query.pullRequest === 'true' ? true : query.pullRequest === 'false' ? false : undefined
  const state = query.state as 'open' | 'closed' | undefined
  const authorParam = query.author as string | undefined
  const authorIsBot = query.authorIsBot === 'true' ? true : query.authorIsBot === 'false' ? false : undefined
  const assigneeParam = query.assignee as string | undefined
  const reviewRequestedParam = query.reviewRequested as string | undefined
  const hasLinkedPr = query.hasLinkedPr === 'true' ? true : query.hasLinkedPr === 'false' ? false : undefined
  const hasMaintainerComment = query.hasMaintainerComment === 'true' ? true : query.hasMaintainerComment === 'false' ? false : undefined
  const draft = query.draft === 'true' ? true : query.draft === 'false' ? false : undefined
  const merged = query.merged === 'true' ? true : query.merged === 'false' ? false : undefined
  const isApproved = query.isApproved === 'true' ? true : query.isApproved === 'false' ? false : undefined
  const hasChangesRequested = query.hasChangesRequested === 'true' ? true : query.hasChangesRequested === 'false' ? false : undefined
  const hasRequestedReviewers = query.hasRequestedReviewers === 'true' ? true : query.hasRequestedReviewers === 'false' ? false : undefined
  const ciPassing = query.ciPassing === 'true' ? true : query.ciPassing === 'false' ? false : undefined
  const excludeBotWithPassingCi = query.excludeBotWithPassingCi === 'true'
  const isBug = query.isBug === 'true' ? true : query.isBug === 'false' ? false : undefined
  const hasLabels = query.hasLabels === 'true' ? true : query.hasLabels === 'false' ? false : undefined
  const hasType = query.hasType === 'true' ? true : query.hasType === 'false' ? false : undefined
  const excludeBots = query.excludeBots === 'true'
  const hasLabel = query.hasLabel as string | undefined
  const excludeLabel = query.excludeLabel as string | undefined
  const minEngagement = query.minEngagement ? parseInt(query.minEngagement as string, 10) : undefined
  const sort = (query.sort as 'updated' | 'created' | 'engagement') || 'updated'
  const limit = query.limit ? Math.min(parseInt(query.limit as string, 10), 500) : undefined

  // Resolve 'me' to current user ID
  const authorId = authorParam === 'me' ? user!.id : authorParam ? parseInt(authorParam, 10) : undefined
  const assigneeId = assigneeParam === 'me' ? user!.id : assigneeParam ? parseInt(assigneeParam, 10) : undefined
  const reviewRequestedId = reviewRequestedParam === 'me' ? user!.id : reviewRequestedParam ? parseInt(reviewRequestedParam, 10) : undefined

  // Build where conditions
  const conditions: any[] = [
    inArray(schema.issues.repositoryId, favoriteRepoIdsSubquery)
  ]

  // Filter by pullRequest
  if (pullRequest !== undefined) {
    conditions.push(eq(schema.issues.pullRequest, pullRequest))
  }

  // Filter by state
  if (state) {
    conditions.push(eq(schema.issues.state, state))
  }

  // Filter by author
  if (authorId !== undefined) {
    conditions.push(eq(schema.issues.userId, authorId))
  }

  // Filter by assignee
  if (assigneeId !== undefined) {
    const assignedIssueIds = db
      .select({ id: schema.issueAssignees.issueId })
      .from(schema.issueAssignees)
      .where(eq(schema.issueAssignees.userId, assigneeId))
    conditions.push(inArray(schema.issues.id, assignedIssueIds))
  }

  // Filter by requested reviewer (PRs only)
  if (reviewRequestedId !== undefined) {
    const reviewRequestedIssueIds = db
      .select({ id: schema.issueRequestedReviewers.issueId })
      .from(schema.issueRequestedReviewers)
      .where(eq(schema.issueRequestedReviewers.userId, reviewRequestedId))
    conditions.push(inArray(schema.issues.id, reviewRequestedIssueIds))
  }

  // Filter by hasRequestedReviewers (PRs only)
  if (hasRequestedReviewers !== undefined) {
    const issueIdsWithReviewers = db
      .selectDistinct({ id: schema.issueRequestedReviewers.issueId })
      .from(schema.issueRequestedReviewers)

    if (hasRequestedReviewers) {
      conditions.push(inArray(schema.issues.id, issueIdsWithReviewers))
    } else {
      conditions.push(notInArray(schema.issues.id, issueIdsWithReviewers))
    }
  }

  // Filter by draft (PRs only)
  if (draft !== undefined) {
    conditions.push(eq(schema.issues.draft, draft))
  }

  // Filter by merged (PRs only)
  if (merged !== undefined) {
    conditions.push(eq(schema.issues.merged, merged))
  }

  // Exclude bots
  if (excludeBots) {
    const botUserIdsSubquery = db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(ilike(schema.users.login, '%[bot]%'))
    conditions.push(notInArray(schema.issues.userId, botUserIdsSubquery))
  }

  // Filter by bot authors (for dependency updates)
  if (authorIsBot !== undefined) {
    const botUserIdsSubquery = db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(ilike(schema.users.login, '%[bot]%'))

    if (authorIsBot) {
      conditions.push(inArray(schema.issues.userId, botUserIdsSubquery))
    } else {
      conditions.push(notInArray(schema.issues.userId, botUserIdsSubquery))
    }
  }

  // Filter by bug label/type
  if (isBug !== undefined) {
    const bugLabelIdsSubquery = db
      .select({ id: schema.labels.id })
      .from(schema.labels)
      .where(and(
        inArray(schema.labels.repositoryId, favoriteRepoIdsSubquery),
        ilike(schema.labels.name, '%bug%')
      ))

    const bugIssueIdsFromLabels = db
      .selectDistinct({ id: schema.issueLabels.issueId })
      .from(schema.issueLabels)
      .where(inArray(schema.issueLabels.labelId, bugLabelIdsSubquery))

    const bugIssueIdsFromType = db
      .selectDistinct({ id: schema.issues.id })
      .from(schema.issues)
      .innerJoin(schema.types, eq(schema.issues.typeId, schema.types.id))
      .where(and(
        inArray(schema.issues.repositoryId, favoriteRepoIdsSubquery),
        ilike(schema.types.name, 'bug')
      ))

    if (isBug) {
      conditions.push(sql`(${inArray(schema.issues.id, bugIssueIdsFromLabels)} OR ${inArray(schema.issues.id, bugIssueIdsFromType)})`)
    } else {
      conditions.push(notInArray(schema.issues.id, bugIssueIdsFromLabels))
      conditions.push(notInArray(schema.issues.id, bugIssueIdsFromType))
    }
  }

  // Filter by hasLabel
  if (hasLabel) {
    const labelIdsSubquery = db
      .select({ id: schema.labels.id })
      .from(schema.labels)
      .where(and(
        inArray(schema.labels.repositoryId, favoriteRepoIdsSubquery),
        ilike(schema.labels.name, `%${hasLabel}%`)
      ))

    const issueIdsWithLabel = db
      .selectDistinct({ id: schema.issueLabels.issueId })
      .from(schema.issueLabels)
      .where(inArray(schema.issueLabels.labelId, labelIdsSubquery))

    conditions.push(inArray(schema.issues.id, issueIdsWithLabel))
  }

  // Filter by excludeLabel
  if (excludeLabel) {
    const excludeLabelIdsSubquery = db
      .select({ id: schema.labels.id })
      .from(schema.labels)
      .where(and(
        inArray(schema.labels.repositoryId, favoriteRepoIdsSubquery),
        ilike(schema.labels.name, `%${excludeLabel}%`)
      ))

    const issueIdsWithExcludedLabel = db
      .selectDistinct({ id: schema.issueLabels.issueId })
      .from(schema.issueLabels)
      .where(inArray(schema.issueLabels.labelId, excludeLabelIdsSubquery))

    conditions.push(notInArray(schema.issues.id, issueIdsWithExcludedLabel))
  }

  // Filter by hasLabels (has any labels or not)
  if (hasLabels !== undefined) {
    const issueIdsWithLabels = db
      .selectDistinct({ id: schema.issueLabels.issueId })
      .from(schema.issueLabels)

    if (hasLabels) {
      conditions.push(inArray(schema.issues.id, issueIdsWithLabels))
    } else {
      conditions.push(notInArray(schema.issues.id, issueIdsWithLabels))
    }
  }

  // Filter by hasType (has issue type or not)
  if (hasType !== undefined) {
    if (hasType) {
      conditions.push(sql`${schema.issues.typeId} IS NOT NULL`)
    } else {
      conditions.push(isNull(schema.issues.typeId))
    }
  }

  // Filter by minEngagement
  if (minEngagement !== undefined) {
    conditions.push(gt(sql`${schema.issues.reactionCount} + ${schema.issues.commentCount}`, minEngagement))
  }

  // Filter by hasLinkedPr (subquery on junction table)
  let linkedIssueIdsSet: Set<number> | null = null
  if (hasLinkedPr !== undefined) {
    // We need to know which issues have linked PRs
    // For hasLinkedPr=true, we include only those
    // For hasLinkedPr=false, we exclude those
    const linkedIssueIds = await db
      .selectDistinct({ issueId: schema.issueLinkedPrs.issueId })
      .from(schema.issueLinkedPrs)
      .innerJoin(schema.issues, eq(schema.issueLinkedPrs.prId, schema.issues.id))
      .where(eq(schema.issues.state, 'open')) // Only count open PRs

    linkedIssueIdsSet = new Set(linkedIssueIds.map(r => r.issueId))

    if (hasLinkedPr) {
      // Only include issues that ARE in the linked set
      if (linkedIssueIdsSet.size > 0) {
        conditions.push(inArray(schema.issues.id, [...linkedIssueIdsSet]))
      } else {
        // No linked issues exist, return empty
        return []
      }
    }
    // For hasLinkedPr=false, we'll filter in JS after fetching
  }

  // Determine sort order
  let orderBy
  switch (sort) {
    case 'created':
      orderBy = desc(schema.issues.createdAt)
      break
    case 'engagement':
      orderBy = desc(sql`${schema.issues.reactionCount} + ${schema.issues.commentCount}`)
      break
    case 'updated':
    default:
      orderBy = desc(schema.issues.updatedAt)
  }

  // Determine if we need to fetch comments (for hasMaintainerComment filter or for issues to show indicator)
  const needsComments = hasMaintainerComment !== undefined || pullRequest === false

  // Fetch issues
  const issues = await db.query.issues.findMany({
    where: and(...conditions),
    orderBy,
    limit,
    with: {
      repository: true,
      user: true,
      type: true,
      labels: { with: { label: true } },
      comments: needsComments ? { with: { user: true } } : undefined,
      reviews: (isApproved !== undefined || hasChangesRequested !== undefined) ? true : undefined
    }
  })

  // Get CI status if needed
  let ciByHeadSha: Map<string, any[]> | null = null
  if (ciPassing !== undefined || excludeBotWithPassingCi) {
    const prsWithHeadSha = issues
      .filter(i => i.pullRequest && i.headSha)
      .map(pr => ({ repositoryId: pr.repositoryId, headSha: pr.headSha! }))
    if (prsWithHeadSha.length > 0) {
      ciByHeadSha = await getCIStatusForPRs(prsWithHeadSha)
    }
  }

  // Get collaborators for hasMaintainerComment (for filter or indicator)
  let maintainerIds: Set<number> | null = null
  if (needsComments) {
    const collaborators = await db
      .select({ userId: schema.repositoryCollaborators.userId })
      .from(schema.repositoryCollaborators)
      .where(inArray(schema.repositoryCollaborators.repositoryId, favoriteRepoIdsSubquery))

    maintainerIds = new Set(collaborators.map(c => c.userId))
  }

  // Post-fetch filtering
  const filteredIssues = issues.filter((issue) => {
    // Filter by hasMaintainerComment
    if (hasMaintainerComment !== undefined && maintainerIds) {
      const comments = (issue as any).comments || []
      const hasMaintainer = comments.some((c: any) =>
        c.userId && maintainerIds!.has(c.userId)
      )
      if (hasMaintainerComment !== hasMaintainer) return false
    }

    // Filter by hasLinkedPr=false (exclude linked issues)
    if (hasLinkedPr === false && linkedIssueIdsSet) {
      if (linkedIssueIdsSet.has(issue.id)) return false
    }

    // Filter by isApproved (PRs only)
    // Bot PRs (renovate, dependabot) are considered auto-approved
    if (isApproved !== undefined && issue.pullRequest) {
      const authorLogin = issue.user?.login || ''
      const isBot = authorLogin.includes('[bot]')

      if (isBot) {
        // Bot PRs are auto-approved, no human review needed
        if (isApproved !== true) return false
      } else {
        // Human PRs need actual approval
        const reviews = (issue as any).reviews || []
        const hasChangesRequestedReview = reviews.some((r: any) => r.state === 'CHANGES_REQUESTED')
        const hasApproval = reviews.some((r: any) => r.state === 'APPROVED')
        const approved = hasApproval && !hasChangesRequestedReview

        if (isApproved !== approved) return false
      }
    }

    // Filter by hasChangesRequested (PRs only)
    if (hasChangesRequested !== undefined && issue.pullRequest) {
      const reviews = (issue as any).reviews || []
      const hasChangesRequestedReview = reviews.some((r: any) => r.state === 'CHANGES_REQUESTED')

      if (hasChangesRequested !== hasChangesRequestedReview) return false
    }

    // Filter by ciPassing (PRs only)
    if (ciPassing !== undefined && issue.pullRequest && ciByHeadSha) {
      const ciStatuses = issue.headSha ? ciByHeadSha.get(issue.headSha) : null

      // No CI = considered passing (some repos don't have CI)
      let passing = true
      if (ciStatuses && ciStatuses.length > 0) {
        passing = ciStatuses.every(ci =>
          ci.conclusion === 'success' || ci.conclusion === 'skipped'
        )
      }

      if (ciPassing !== passing) return false
    }

    // Exclude bot PRs that have passing CI (they should be in Ready to Merge instead)
    if (excludeBotWithPassingCi && issue.pullRequest && ciByHeadSha) {
      const authorLogin = issue.user?.login || ''
      const isBot = authorLogin.includes('[bot]')

      if (isBot) {
        const ciStatuses = issue.headSha ? ciByHeadSha.get(issue.headSha) : null
        // No CI = considered passing
        let passing = true
        if (ciStatuses && ciStatuses.length > 0) {
          passing = ciStatuses.every(ci =>
            ci.conclusion === 'success' || ci.conclusion === 'skipped'
          )
        }
        // Exclude bot PRs with passing CI
        if (passing) return false
      }
    }

    return true
  })

  // Get linked PRs for all issues (only for non-PRs)
  const issueIds = filteredIssues.filter(i => !i.pullRequest).map(i => i.id)
  const linkedPRsByIssue = issueIds.length > 0
    ? await getLinkedPRsForIssues(issueIds)
    : new Map()

  // Get CI status for PRs if not already fetched
  if (!ciByHeadSha) {
    const prsWithHeadSha = filteredIssues
      .filter(i => i.pullRequest && i.headSha)
      .map(pr => ({ repositoryId: pr.repositoryId, headSha: pr.headSha! }))
    if (prsWithHeadSha.length > 0) {
      ciByHeadSha = await getCIStatusForPRs(prsWithHeadSha)
    }
  }

  return filteredIssues.map((issue) => {
    // Compute hasMaintainerComment for issues
    let hasMaintainerCommentValue: boolean | undefined
    if (!issue.pullRequest && maintainerIds) {
      const comments = (issue as any).comments || []
      hasMaintainerCommentValue = comments.some((c: any) =>
        c.userId && maintainerIds!.has(c.userId)
      )
    }

    return {
      ...issue,
      labels: issue.labels.map(l => l.label),
      linkedPrs: linkedPRsByIssue.get(issue.id) || [],
      ciStatuses: issue.pullRequest && issue.headSha && ciByHeadSha
        ? ciByHeadSha.get(issue.headSha) || []
        : [],
      hasMaintainerComment: hasMaintainerCommentValue,
      // Remove internal fields from response
      comments: undefined,
      reviews: undefined
    }
  })
})
