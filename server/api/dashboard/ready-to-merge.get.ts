import { and, inArray, eq, desc } from 'drizzle-orm'
import { db, schema } from 'hub:db'

// PRs that are approved, no changes requested, CI passing
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  const prs = await db.query.issues.findMany({
    where: and(
      eq(schema.issues.pullRequest, true),
      eq(schema.issues.state, 'open'),
      eq(schema.issues.draft, false),
      inArray(schema.issues.repositoryId, getUserFavoriteRepoIdsSubquery(user!.id))
    ),
    orderBy: desc(schema.issues.updatedAt),
    with: {
      repository: true,
      user: true,
      labels: { with: { label: true } },
      reviews: true
    }
  })

  if (prs.length === 0) return []

  const ciByHeadSha = await getCIStatusForPRs(prs.map(pr => ({ repositoryId: pr.repositoryId, headSha: pr.headSha })))

  // Filter PRs: approved, no changes requested, CI passing
  return prs
    .filter((pr) => {
      const hasChangesRequested = pr.reviews.some(r => r.state === 'CHANGES_REQUESTED')
      const hasApproval = pr.reviews.some(r => r.state === 'APPROVED')

      if (hasChangesRequested || !hasApproval) return false

      // Check CI status (pass if no CI or CI passed)
      const ciStatus = pr.headSha ? ciByHeadSha.get(pr.headSha) : null
      if (ciStatus && ciStatus.conclusion !== 'success') return false

      return true
    })
    .map(pr => ({
      ...pr,
      labels: pr.labels.map(l => l.label),
      ciStatus: pr.headSha ? ciByHeadSha.get(pr.headSha) || null : null
    }))
})
