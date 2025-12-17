import { eq, and, inArray, desc } from 'drizzle-orm'
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

  return db
    .select({
      id: schema.issues.id,
      type: schema.issues.type,
      number: schema.issues.number,
      title: schema.issues.title,
      state: schema.issues.state,
      draft: schema.issues.draft,
      htmlUrl: schema.issues.htmlUrl,
      createdAt: schema.issues.createdAt,
      updatedAt: schema.issues.updatedAt,
      reactionCount: schema.issues.reactionCount,
      commentCount: schema.issues.commentCount,
      repository: {
        id: schema.repositories.id,
        name: schema.repositories.name,
        fullName: schema.repositories.fullName
      }
    })
    .from(schema.issues)
    .innerJoin(schema.repositories, eq(schema.issues.repositoryId, schema.repositories.id))
    .where(and(
      eq(schema.issues.userId, userId),
      eq(schema.issues.type, 'pull_request'),
      eq(schema.issues.state, 'open'),
      inArray(schema.issues.repositoryId, favoriteRepoIds)
    ))
    .orderBy(desc(schema.issues.updatedAt))
    .limit(10)
})
