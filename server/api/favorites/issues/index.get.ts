import { eq, and, inArray } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const userId = user.id

  // Subquery: repositories where user is a collaborator
  const accessibleRepoIds = db
    .select({ repositoryId: schema.repositoryCollaborators.repositoryId })
    .from(schema.repositoryCollaborators)
    .where(eq(schema.repositoryCollaborators.userId, userId))

  // Get favorites with relations, filtered to accessible repositories
  const favorites = await db.query.favoriteIssues.findMany({
    where: and(
      eq(schema.favoriteIssues.userId, userId),
      inArray(
        schema.favoriteIssues.issueId,
        db.select({ issueId: schema.issues.id })
          .from(schema.issues)
          .where(inArray(schema.issues.repositoryId, accessibleRepoIds))
      )
    ),
    with: {
      issue: {
        columns: {
          id: true,
          pullRequest: true,
          number: true,
          title: true,
          state: true,
          stateReason: true,
          draft: true,
          merged: true,
          htmlUrl: true
        },
        with: {
          repository: {
            columns: {
              id: true,
              name: true,
              fullName: true
            }
          }
        }
      }
    }
  })

  return favorites
})
