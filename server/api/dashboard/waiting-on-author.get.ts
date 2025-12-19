import { and, inArray, eq, desc } from 'drizzle-orm'
import { db, schema } from 'hub:db'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  // Get open PRs with reviews and labels
  const prs = await db.query.issues.findMany({
    where: and(
      eq(schema.issues.pullRequest, true),
      eq(schema.issues.state, 'open'),
      eq(schema.issues.merged, false),
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

  // Get CI status for all PRs (batch query)
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
        ciStatus: pr.headSha
          ? ciByHeadSha.get(pr.headSha) || null
          : null
      }
    })
})
