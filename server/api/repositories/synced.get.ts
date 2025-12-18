import { eq, and } from 'drizzle-orm'
import { db, schema } from 'hub:db'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  // Get all synced repositories where user is a collaborator
  const repositories = await db
    .select({
      id: schema.repositories.id,
      name: schema.repositories.name,
      fullName: schema.repositories.fullName,
      private: schema.repositories.private,
      description: schema.repositories.description
    })
    .from(schema.repositories)
    .innerJoin(
      schema.repositoryCollaborators,
      and(
        eq(schema.repositoryCollaborators.repositoryId, schema.repositories.id),
        eq(schema.repositoryCollaborators.userId, user!.id)
      )
    )
    .orderBy(schema.repositories.fullName)

  return repositories
})
