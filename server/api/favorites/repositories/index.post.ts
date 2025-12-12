import { eq, and } from 'drizzle-orm'
import { db, schema } from 'hub:db'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const { repositoryId } = await readBody<{ repositoryId: number }>(event)

  if (!repositoryId) {
    throw createError({
      statusCode: 400,
      message: 'repositoryId is required'
    })
  }

  // Check if repository exists
  const [repository] = await db
    .select()
    .from(schema.repositories)
    .where(eq(schema.repositories.id, repositoryId))

  if (!repository) {
    throw createError({
      statusCode: 404,
      message: 'Repository not found'
    })
  }

  // Check if already favorited
  const [existing] = await db
    .select()
    .from(schema.favoriteRepositories)
    .where(and(
      eq(schema.favoriteRepositories.userId, user!.id),
      eq(schema.favoriteRepositories.repositoryId, repositoryId)
    ))

  if (existing) {
    return { id: existing.id, repositoryId, alreadyExists: true }
  }

  // Create favorite
  const [favorite] = await db
    .insert(schema.favoriteRepositories)
    .values({
      userId: user!.id,
      repositoryId
    })
    .returning()

  return { id: favorite.id, repositoryId, alreadyExists: false }
})
