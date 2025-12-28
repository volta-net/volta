import { eq, desc } from 'drizzle-orm'
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

  // Get issues and PRs for this repository (limited, most recent first)
  const issues = await db.query.issues.findMany({
    where: eq(schema.issues.repositoryId, repository.id),
    orderBy: [desc(schema.issues.updatedAt)],
    limit: 100,
    columns: {
      id: true,
      number: true,
      title: true,
      state: true,
      pullRequest: true
    }
  })

  return issues
})
