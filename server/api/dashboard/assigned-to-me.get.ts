import { and, inArray, eq, desc } from 'drizzle-orm'
import { db, schema } from 'hub:db'

// Issues/PRs assigned to the current user
// Query params:
// - pullRequest: 'true' | 'false' (required)
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const userId = user!.id

  const query = getQuery(event)
  const pullRequest = query.pullRequest === 'true'

  const items = await db.query.issues.findMany({
    where: and(
      inArray(
        schema.issues.id,
        db.select({ id: schema.issueAssignees.issueId })
          .from(schema.issueAssignees)
          .where(eq(schema.issueAssignees.userId, userId))
      ),
      eq(schema.issues.pullRequest, pullRequest),
      eq(schema.issues.state, 'open'),
      pullRequest ? eq(schema.issues.merged, false) : undefined,
      inArray(schema.issues.repositoryId, getUserFavoriteRepoIdsSubquery(userId))
    ),
    orderBy: desc(schema.issues.updatedAt),
    with: {
      repository: true,
      user: true,
      type: true,
      labels: { with: { label: true } }
    }
  })

  if (items.length === 0) return []

  // For PRs, get CI status
  if (pullRequest) {
    const ciByHeadSha = await getCIStatusForPRs(items.map(item => ({ repositoryId: item.repositoryId, headSha: item.headSha })))

    return items.map(item => ({
      ...item,
      labels: item.labels.map(l => l.label),
      ciStatuses: item.headSha ? ciByHeadSha.get(item.headSha) || [] : []
    }))
  }

  return items.map(item => ({
    ...item,
    labels: item.labels.map(l => l.label)
  }))
})
