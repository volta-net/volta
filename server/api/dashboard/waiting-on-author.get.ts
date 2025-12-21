import { and, inArray, eq, desc } from 'drizzle-orm'
import { db, schema } from 'hub:db'

// PRs where changes are requested (waiting on author)
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  const prs = await db.query.issues.findMany({
    where: and(
      eq(schema.issues.pullRequest, true),
      eq(schema.issues.state, 'open'),
      inArray(schema.issues.repositoryId, getUserFavoriteRepoIdsSubquery(user!.id))
    ),
    orderBy: desc(schema.issues.updatedAt),
    with: {
      repository: true,
      user: true,
      labels: { with: { label: true } },
      reviews: {
        orderBy: desc(schema.issueReviews.submittedAt),
        limit: 1,
        with: { user: true }
      }
    }
  })

  if (prs.length === 0) return []

  const ciByHeadSha = await getCIStatusForPRs(prs.map(pr => ({ repositoryId: pr.repositoryId, headSha: pr.headSha })))

  // Filter to PRs where latest review is CHANGES_REQUESTED
  return prs
    .filter((pr) => {
      const latestReview = pr.reviews[0]
      return latestReview?.state === 'CHANGES_REQUESTED'
    })
    .map((pr) => {
      const latestReview = pr.reviews[0]!
      return {
        ...pr,
        latestReview: {
          state: latestReview.state,
          reviewer: latestReview.user
        },
        labels: pr.labels.map(l => l.label),
        ciStatus: pr.headSha ? ciByHeadSha.get(pr.headSha) || null : null
      }
    })
})
