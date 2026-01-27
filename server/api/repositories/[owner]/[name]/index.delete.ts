import { eq } from 'drizzle-orm'
import { schema } from '@nuxthub/db'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  const owner = getRouterParam(event, 'owner')
  const name = getRouterParam(event, 'name')

  if (!owner || !name) {
    throw createError({ statusCode: 400, message: 'Owner and repository name are required' })
  }

  const fullName = `${owner}/${name}`

  // Find the repository
  const repository = await dbs.query.repositories.findFirst({
    where: eq(schema.repositories.fullName, fullName)
  })

  if (!repository) {
    throw createError({ statusCode: 404, message: 'Repository not found' })
  }

  // Verify user has access to this repository
  await requireRepositoryAccess(user.id, repository.id)

  // Delete the repository (cascade will handle issues, PRs, labels, milestones)
  await dbs.delete(schema.repositories).where(eq(schema.repositories.id, repository.id))

  return { success: true, repository: fullName }
})
