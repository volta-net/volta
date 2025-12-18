import { eq } from 'drizzle-orm'
import { db, schema } from 'hub:db'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const owner = getRouterParam(event, 'owner')
  const name = getRouterParam(event, 'name')

  if (!owner || !name) {
    throw createError({ statusCode: 400, message: 'Owner and repository name are required' })
  }

  const fullName = `${owner}/${name}`

  const repository = await db.query.repositories.findFirst({
    where: eq(schema.repositories.fullName, fullName)
  })

  if (!repository) {
    throw createError({ statusCode: 404, message: 'Repository not found' })
  }

  // Verify user has access to this repository
  await requireRepositoryAccess(user!.id, repository.id)

  const labels = await db.query.labels.findMany({
    where: eq(schema.labels.repositoryId, repository.id),
    orderBy: (labels, { asc }) => [asc(labels.name)]
  })

  return labels
})
