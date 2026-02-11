import { eq, and } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const owner = getRouterParam(event, 'owner')
  const name = getRouterParam(event, 'name')

  if (!owner || !name) {
    throw createError({ statusCode: 400, message: 'Owner and repository name are required' })
  }

  const fullName = `${owner}/${name}`

  // Find the repository
  const repository = await db.query.repositories.findFirst({
    where: eq(schema.repositories.fullName, fullName)
  })

  if (!repository) {
    throw createError({ statusCode: 404, message: 'Repository not found' })
  }

  // Check user has access (public repos are accessible to any authenticated user)
  if (repository.private) {
    await requireRepositoryAccess(user.id, repository.id)
  }

  // Delete subscription
  await db
    .delete(schema.repositorySubscriptions)
    .where(and(
      eq(schema.repositorySubscriptions.repositoryId, repository.id),
      eq(schema.repositorySubscriptions.userId, user.id)
    ))

  return { subscribed: false }
})
