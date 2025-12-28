import { eq } from 'drizzle-orm'
import { db, schema } from 'hub:db'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const owner = getRouterParam(event, 'owner')
  const name = getRouterParam(event, 'name')

  if (!owner || !name) {
    throw createError({ statusCode: 400, message: 'Owner and name are required' })
  }

  // Find repository by owner/name
  const fullName = `${owner}/${name}`
  const repository = await db.query.repositories.findFirst({
    where: eq(schema.repositories.fullName, fullName)
  })

  if (!repository) {
    throw createError({ statusCode: 404, message: 'Repository not found' })
  }

  // Check user has access to this repository
  await requireRepositoryAccess(user.id, repository.id)

  // Get collaborators with user details
  const collaborators = await db.query.repositoryCollaborators.findMany({
    where: eq(schema.repositoryCollaborators.repositoryId, repository.id),
    with: {
      user: true
    }
  })

  return collaborators.map(c => ({
    id: c.user.id,
    login: c.user.login,
    name: c.user.name,
    avatarUrl: c.user.avatarUrl
  }))
})
