import { and, inArray, eq, desc } from 'drizzle-orm'
import { db, schema } from 'hub:db'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const userId = user!.id

  const favoriteRepoIds = await getUserFavoriteRepoIds(userId)
  if (favoriteRepoIds.length === 0) return []

  const prs = await db.query.issues.findMany({
    where: and(
      eq(schema.issues.userId, userId),
      eq(schema.issues.pullRequest, true),
      eq(schema.issues.state, 'open'),
      inArray(schema.issues.repositoryId, favoriteRepoIds)
    ),
    orderBy: desc(schema.issues.updatedAt),
    with: {
      repository: true,
      labels: { with: { label: true } }
    }
  })

  // Get CI status (batch query)
  const ciByHeadSha = await getCIStatusForPRs(prs.map(pr => ({ repositoryId: pr.repositoryId, headSha: pr.headSha })))

  return prs.map(pr => ({
    ...pr,
    labels: pr.labels.map(l => l.label),
    ciStatus: pr.headSha
      ? ciByHeadSha.get(pr.headSha) || null
      : null
  }))
})
