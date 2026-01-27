import { eq, inArray, asc } from 'drizzle-orm'
import { schema } from '@nuxthub/db'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const userId = user.id

  // Subquery: repositories where user is a collaborator
  const accessibleRepoIds = db
    .select({ repositoryId: schema.repositoryCollaborators.repositoryId })
    .from(schema.repositoryCollaborators)
    .where(eq(schema.repositoryCollaborators.userId, userId))

  // Get all synced repositories where user is a collaborator
  const repositories = await dbs.query.repositories.findMany({
    where: inArray(schema.repositories.id, accessibleRepoIds),
    columns: {
      id: true,
      name: true,
      fullName: true,
      private: true,
      description: true
    },
    orderBy: asc(schema.repositories.fullName)
  })

  return repositories
})
