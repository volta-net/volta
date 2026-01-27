import { and, inArray, eq, desc } from 'drizzle-orm'
import { schema } from '@nuxthub/db'

/**
 * Get issues/PRs for the current user's favorite repositories
 *
 * Query params:
 * - pullRequest: 'true' | 'false' - filter by PR or issue
 * - state: 'open' | 'closed' - filter by state
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const query = getQuery(event)

  const favoriteRepoIds = getUserFavoriteRepoIdsSubquery(user.id)

  // Parse query parameters
  const pullRequest = query.pullRequest === 'true' ? true : query.pullRequest === 'false' ? false : undefined
  const state = query.state as 'open' | 'closed' | undefined

  // Build where conditions
  const conditions = [inArray(schema.issues.repositoryId, favoriteRepoIds)]

  if (pullRequest !== undefined) {
    conditions.push(eq(schema.issues.pullRequest, pullRequest))
  }

  if (state) {
    conditions.push(eq(schema.issues.state, state))
  }

  // Fetch issues
  const issues = await dbs.query.issues.findMany({
    where: and(...conditions),
    orderBy: desc(schema.issues.updatedAt),
    with: {
      repository: true,
      user: { columns: PRIVATE_USER_COLUMNS },
      type: true,
      labels: { with: { label: true } },
      resolutionAnsweredBy: { columns: PRIVATE_USER_COLUMNS },
      // PRs only
      reviews: pullRequest !== false ? true : undefined,
      requestedReviewers: pullRequest !== false ? true : undefined,
      // Issues only - for maintainer comment indicator
      comments: pullRequest === false ? { columns: { id: true, userId: true } } : undefined
    }
  })

  // Get collaborator IDs for maintainer comment check (issues only)
  let maintainerIds: Set<number> | null = null
  if (pullRequest === false) {
    const collaborators = await db
      .select({ userId: schema.repositoryCollaborators.userId })
      .from(schema.repositoryCollaborators)
      .where(inArray(schema.repositoryCollaborators.repositoryId, favoriteRepoIds))

    maintainerIds = new Set(collaborators.map(c => c.userId))
  }

  // Get linked PRs for issues
  const issueIds = issues.filter(i => !i.pullRequest).map(i => i.id)
  const linkedPRsByIssue = issueIds.length > 0
    ? await getLinkedPRsForIssues(issueIds)
    : new Map()

  // Get CI status for PRs
  const prsWithHeadSha = issues
    .filter(i => i.pullRequest && i.headSha)
    .map(pr => ({ repositoryId: pr.repositoryId, headSha: pr.headSha! }))
  const ciByHeadSha = prsWithHeadSha.length > 0
    ? await getCIStatusForPRs(prsWithHeadSha)
    : new Map()

  return issues.map(issue => ({
    ...issue,
    labels: issue.labels.map(l => l.label),
    // PRs: review data and CI status
    reviews: issue.pullRequest
      ? issue.reviews?.map(r => ({ state: r.state }))
      : undefined,
    requestedReviewers: issue.pullRequest
      ? issue.requestedReviewers?.map(r => ({ id: r.userId! }))
      : undefined,
    ciStatuses: issue.pullRequest && issue.headSha
      ? ciByHeadSha.get(`${issue.repositoryId}:${issue.headSha}`) || []
      : undefined,
    // Issues: linked PRs and maintainer comment indicator
    linkedPrs: !issue.pullRequest
      ? linkedPRsByIssue.get(issue.id) || []
      : undefined,
    hasMaintainerComment: !issue.pullRequest && maintainerIds
      ? issue.comments?.some(c => c.userId && maintainerIds!.has(c.userId))
      : undefined,
    // Remove internal fields
    comments: undefined
  }))
})
