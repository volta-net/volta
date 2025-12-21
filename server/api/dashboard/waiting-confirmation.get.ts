import { and, inArray, notInArray, eq, desc, ilike, or } from 'drizzle-orm'
import { db, schema } from 'hub:db'
import { analyzeIssuesAnswered } from '../../utils/ai'

// Analysis timeout - must match ai.ts
const ANALYSIS_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Issues waiting for confirmation/feedback:
 * - Maintainer has commented but AI hasn't confirmed it's answered yet
 * - OR has "needs reproduction" label (waiting for author to provide repro)
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  const favoriteRepoIdsSubquery = getUserFavoriteRepoIdsSubquery(user!.id)

  // Bot users subquery
  const botUserIdsSubquery = db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(ilike(schema.users.login, '%[bot]%'))

  // "Needs reproduction" labels
  const needsReproLabelsSubquery = db
    .select({ id: schema.labels.id })
    .from(schema.labels)
    .where(and(
      inArray(schema.labels.repositoryId, favoriteRepoIdsSubquery),
      or(
        ilike(schema.labels.name, '%needs reproduction%'),
        ilike(schema.labels.name, '%needs-reproduction%')
      )
    ))

  // Get issue IDs with needs reproduction labels
  const needsReproIssueIds = await db
    .selectDistinct({ id: schema.issueLabels.issueId })
    .from(schema.issueLabels)
    .where(inArray(schema.issueLabels.labelId, needsReproLabelsSubquery))

  const needsReproIssueIdsSet = new Set(needsReproIssueIds.map(r => r.id))

  // "Upstream" labels - issues waiting on external fixes, should NOT be analyzed
  const upstreamLabelsSubquery = db
    .select({ id: schema.labels.id })
    .from(schema.labels)
    .where(and(
      inArray(schema.labels.repositoryId, favoriteRepoIdsSubquery),
      or(
        ilike(schema.labels.name, 'upstream'),
        ilike(schema.labels.name, 'upstream-%'),
        ilike(schema.labels.name, 'upstream/%')
      )
    ))

  // Get issue IDs with upstream labels
  const upstreamIssueIds = await db
    .selectDistinct({ id: schema.issueLabels.issueId })
    .from(schema.issueLabels)
    .where(inArray(schema.issueLabels.labelId, upstreamLabelsSubquery))

  const upstreamIssueIdsSet = new Set(upstreamIssueIds.map(r => r.id))

  // Collaborator user IDs for favorite repos
  const collaborators = await db
    .select({
      userId: schema.repositoryCollaborators.userId,
      login: schema.users.login
    })
    .from(schema.repositoryCollaborators)
    .innerJoin(schema.users, eq(schema.repositoryCollaborators.userId, schema.users.id))
    .where(inArray(schema.repositoryCollaborators.repositoryId, favoriteRepoIdsSubquery))

  const maintainerIds = new Set(collaborators.map(c => c.userId))
  const maintainerLogins = [...new Set(collaborators.map(c => c.login))]

  // Get open issues with comments
  const issues = await db.query.issues.findMany({
    where: and(
      eq(schema.issues.pullRequest, false),
      eq(schema.issues.state, 'open'),
      inArray(schema.issues.repositoryId, favoriteRepoIdsSubquery),
      notInArray(schema.issues.userId, botUserIdsSubquery)
    ),
    orderBy: desc(schema.issues.updatedAt),
    with: {
      repository: true,
      user: true,
      type: true,
      labels: { with: { label: true } },
      comments: { with: { user: true } }
    }
  })

  // Filter to issues where:
  // 1. Has "needs reproduction" label (waiting for author)
  // 2. OR maintainer has commented but not yet confirmed by AI
  // EXCLUDE: issues with upstream labels (waiting on external fixes)
  const pendingIssues = issues.filter((issue) => {
    const issueAny = issue as any

    // Exclude upstream issues - they should stay in priority bugs
    if (upstreamIssueIdsSet.has(issue.id)) return false

    // Already answered by AI - skip
    if (issueAny.answered === true) return false

    // Has "needs reproduction" label
    if (needsReproIssueIdsSet.has(issue.id)) return true

    // Maintainer has commented
    const hasMaintainerComment = issue.comments.some(c =>
      c.userId && maintainerIds.has(c.userId)
    )
    return hasMaintainerComment
  })

  // Trigger background AI analysis for issues that need it
  // Only analyze issues with maintainer comments (not just "needs reproduction" label)
  const issuesToAnalyze = pendingIssues.filter((issue) => {
    // Skip issues that are only here because of "needs reproduction" label
    const hasMaintainerComment = issue.comments.some(c =>
      c.userId && maintainerIds.has(c.userId)
    )
    if (!hasMaintainerComment) return false

    const issueAny = issue as any
    // No analysis yet
    if (!issueAny.analyzedAt) return true
    // Analysis is stale (issue updated after analysis)
    if (issue.updatedAt && issueAny.analyzedAt < issue.updatedAt) return true
    return false
  })

  if (issuesToAnalyze.length > 0) {
    // Trigger background analysis (fire and forget)
    analyzeIssuesAnswered(
      issuesToAnalyze.map((issue) => {
        const issueAny = issue as any
        return {
          id: issue.id,
          title: issue.title,
          body: issue.body,
          updatedAt: issue.updatedAt,
          authorLogin: issue.user?.login || null,
          maintainerLogins,
          comments: issue.comments.map(c => ({
            id: c.id,
            body: c.body,
            authorLogin: c.user?.login || null
          })),
          answered: issueAny.answered ?? null,
          analyzedAt: issueAny.analyzedAt ?? null,
          analyzingAt: issueAny.analyzingAt ?? null
        }
      })
    ).catch(err => console.error('Background AI analysis failed:', err))
  }

  // Compute analyzing status from analyzingAt timestamp
  const cutoff = new Date(Date.now() - ANALYSIS_TIMEOUT_MS)

  return pendingIssues.map((issue) => {
    const issueAny = issue as any
    const analyzingAt = issueAny.analyzingAt as Date | null
    const isAnalyzing = analyzingAt !== null && analyzingAt > cutoff

    return {
      ...issue,
      labels: issue.labels.map(l => l.label),
      answered: issueAny.answered ?? false,
      analyzing: isAnalyzing
    }
  })
})
