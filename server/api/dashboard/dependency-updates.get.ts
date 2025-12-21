import { and, inArray, eq, desc, or, ilike } from 'drizzle-orm'
import { db, schema } from 'hub:db'

// Dependency update PRs (renovate, dependabot)
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  const prs = await db.query.issues.findMany({
    where: and(
      eq(schema.issues.pullRequest, true),
      eq(schema.issues.state, 'open'),
      inArray(schema.issues.repositoryId, getUserFavoriteRepoIdsSubquery(user!.id)),
      inArray(
        schema.issues.userId,
        db.select({ id: schema.users.id })
          .from(schema.users)
          .where(or(
            ilike(schema.users.login, '%renovate%'),
            ilike(schema.users.login, '%dependabot%')
          ))
      )
    ),
    orderBy: desc(schema.issues.updatedAt),
    limit: 20,
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
    ciStatus: pr.headSha ? ciByHeadSha.get(pr.headSha) || null : null
  }))
})
