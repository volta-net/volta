import { eq, and, inArray, desc, or, ilike } from 'drizzle-orm'
import { db, schema } from 'hub:db'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const userId = user!.id

  const favoriteRepos = await db
    .select({ repositoryId: schema.favoriteRepositories.repositoryId })
    .from(schema.favoriteRepositories)
    .where(eq(schema.favoriteRepositories.userId, userId))

  const favoriteRepoIds = favoriteRepos.map(f => f.repositoryId)

  if (favoriteRepoIds.length === 0) {
    return []
  }

  const renovatePRs = await db
    .select({
      id: schema.issues.id,
      type: schema.issues.type,
      number: schema.issues.number,
      title: schema.issues.title,
      state: schema.issues.state,
      draft: schema.issues.draft,
      htmlUrl: schema.issues.htmlUrl,
      headSha: schema.issues.headSha,
      createdAt: schema.issues.createdAt,
      updatedAt: schema.issues.updatedAt,
      repository: {
        id: schema.repositories.id,
        name: schema.repositories.name,
        fullName: schema.repositories.fullName
      },
      author: {
        id: schema.users.id,
        login: schema.users.login,
        avatarUrl: schema.users.avatarUrl
      }
    })
    .from(schema.issues)
    .innerJoin(schema.repositories, eq(schema.issues.repositoryId, schema.repositories.id))
    .leftJoin(schema.users, eq(schema.issues.userId, schema.users.id))
    .where(and(
      eq(schema.issues.type, 'pull_request'),
      eq(schema.issues.state, 'open'),
      inArray(schema.issues.repositoryId, favoriteRepoIds),
      or(
        ilike(schema.users.login, '%renovate%'),
        ilike(schema.users.login, '%dependabot%')
      )
    ))
    .orderBy(desc(schema.issues.updatedAt))
    .limit(20)

  // Get CI status for renovate PRs
  return Promise.all(
    renovatePRs.map(async (pr) => {
      const [latestRun] = await db
        .select({
          id: schema.workflowRuns.id,
          status: schema.workflowRuns.status,
          conclusion: schema.workflowRuns.conclusion,
          htmlUrl: schema.workflowRuns.htmlUrl,
          name: schema.workflowRuns.name
        })
        .from(schema.workflowRuns)
        .where(and(
          eq(schema.workflowRuns.repositoryId, pr.repository.id),
          eq(schema.workflowRuns.headSha, pr.headSha || '')
        ))
        .orderBy(desc(schema.workflowRuns.createdAt))
        .limit(1)

      return {
        ...pr,
        ciStatus: latestRun || null
      }
    })
  )
})
