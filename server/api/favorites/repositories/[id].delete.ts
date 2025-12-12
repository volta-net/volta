import { eq, and } from 'drizzle-orm'
import { db, schema } from 'hub:db'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const repositoryId = Number(getRouterParam(event, 'id'))

  if (!repositoryId || isNaN(repositoryId)) {
    throw createError({
      statusCode: 400,
      message: 'Invalid repository ID'
    })
  }

  await db
    .delete(schema.favoriteRepositories)
    .where(and(
      eq(schema.favoriteRepositories.userId, user!.id),
      eq(schema.favoriteRepositories.repositoryId, repositoryId)
    ))

  return { success: true }
})
