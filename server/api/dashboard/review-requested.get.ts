import { and, inArray, eq, desc } from 'drizzle-orm'
import { db, schema } from 'hub:db'

// PRs where review is requested from the current user
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const userId = user!.id

  const prs = await db.query.issues.findMany({
    where: and(
      inArray(
        schema.issues.id,
        db.select({ id: schema.issueRequestedReviewers.issueId })
          .from(schema.issueRequestedReviewers)
          .where(eq(schema.issueRequestedReviewers.userId, userId))
      ),
      eq(schema.issues.state, 'open'),
      inArray(schema.issues.repositoryId, getUserFavoriteRepoIdsSubquery(userId))
    ),
    orderBy: desc(schema.issues.updatedAt),
    with: {
      repository: true,
      user: true,
      labels: { with: { label: true } }
    }
  })

  if (prs.length === 0) return []

  const ciByHeadSha = await getCIStatusForPRs(prs.map(pr => ({ repositoryId: pr.repositoryId, headSha: pr.headSha })))

  return prs.map(pr => ({
    ...pr,
    labels: pr.labels.map(l => l.label),
    ciStatuses: pr.headSha ? ciByHeadSha.get(pr.headSha) || [] : []
  }))
})
