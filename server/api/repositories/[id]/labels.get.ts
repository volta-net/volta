import { eq } from 'drizzle-orm'
import { db, schema } from 'hub:db'

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, message: 'Repository ID is required' })
  }

  const repositoryId = parseInt(id)
  if (isNaN(repositoryId)) {
    throw createError({ statusCode: 400, message: 'Invalid repository ID' })
  }

  const labels = await db.query.labels.findMany({
    where: eq(schema.labels.repositoryId, repositoryId),
    orderBy: (labels, { asc }) => [asc(labels.name)]
  })

  return labels
})
