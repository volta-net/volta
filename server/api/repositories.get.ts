import { eq, and, inArray } from 'drizzle-orm'
import { db, schema } from 'hub:db'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const userId = user.id

  // Subquery: repositories where user is a collaborator
  const accessibleRepoIds = db
    .select({ repositoryId: schema.repositoryCollaborators.repositoryId })
    .from(schema.repositoryCollaborators)
    .where(eq(schema.repositoryCollaborators.userId, userId))

  // Get all repositories where user has a subscription AND has collaborator access
  const subscriptions = await db.query.repositorySubscriptions.findMany({
    where: and(
      eq(schema.repositorySubscriptions.userId, userId),
      inArray(schema.repositorySubscriptions.repositoryId, accessibleRepoIds)
    ),
    with: {
      repository: {
        columns: {
          id: true,
          name: true,
          fullName: true,
          private: true,
          description: true
        }
      }
    }
  })

  return subscriptions.map(({ repository, ...subscription }) => ({
    ...repository,
    subscription: {
      issues: subscription.issues,
      pullRequests: subscription.pullRequests,
      releases: subscription.releases,
      ci: subscription.ci,
      mentions: subscription.mentions,
      activity: subscription.activity
    }
  }))
})
