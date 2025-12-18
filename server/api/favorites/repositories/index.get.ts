import { eq, and } from 'drizzle-orm'
import { db, schema } from 'hub:db'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  // Get favorites joined with collaborator check to only return accessible ones
  const favorites = await db
    .select({
      id: schema.favoriteRepositories.id,
      repositoryId: schema.favoriteRepositories.repositoryId,
      repository: {
        id: schema.repositories.id,
        name: schema.repositories.name,
        fullName: schema.repositories.fullName,
        private: schema.repositories.private,
        description: schema.repositories.description,
        htmlUrl: schema.repositories.htmlUrl
      },
      createdAt: schema.favoriteRepositories.createdAt
    })
    .from(schema.favoriteRepositories)
    .innerJoin(
      schema.repositories,
      eq(schema.favoriteRepositories.repositoryId, schema.repositories.id)
    )
    .innerJoin(
      schema.repositoryCollaborators,
      and(
        eq(schema.repositoryCollaborators.repositoryId, schema.repositories.id),
        eq(schema.repositoryCollaborators.userId, user!.id)
      )
    )
    .where(eq(schema.favoriteRepositories.userId, user!.id))

  return favorites.map(f => ({
    id: f.id,
    repositoryId: f.repositoryId,
    repository: f.repository,
    createdAt: f.createdAt
  }))
})
