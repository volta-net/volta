import { and, inArray, eq, desc, or, ilike } from 'drizzle-orm'
import { db, schema } from 'hub:db'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  const favoriteRepoIds = await getUserFavoriteRepoIds(user!.id)
  if (favoriteRepoIds.length === 0) return []

  // Get bot user IDs (renovate/dependabot)
  const botUsers = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(or(
      ilike(schema.users.login, '%renovate%'),
      ilike(schema.users.login, '%dependabot%')
    ))

  if (botUsers.length === 0) return []

  const prs = await db.query.issues.findMany({
    where: and(
      eq(schema.issues.pullRequest, true),
      eq(schema.issues.state, 'open'),
      inArray(schema.issues.repositoryId, favoriteRepoIds),
      inArray(schema.issues.userId, botUsers.map(u => u.id))
    ),
    orderBy: desc(schema.issues.updatedAt),
    limit: 20,
    with: {
      repository: true,
      user: true,
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
