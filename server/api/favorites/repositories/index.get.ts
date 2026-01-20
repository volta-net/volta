import { eq, and, inArray } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  // Get favorites with repository relation, filtered to repos where user is collaborator
  // Uses subquery for single DB round-trip
  const favorites = await db.query.favoriteRepositories.findMany({
    where: and(
      eq(schema.favoriteRepositories.userId, user.id),
      inArray(
        schema.favoriteRepositories.repositoryId,
        db.select({ id: schema.repositoryCollaborators.repositoryId })
          .from(schema.repositoryCollaborators)
          .where(eq(schema.repositoryCollaborators.userId, user.id))
      )
    ),
    with: {
      repository: true
    }
  })

  return favorites
})
