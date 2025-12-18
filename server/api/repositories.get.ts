import { eq, and } from 'drizzle-orm'
import { db, schema } from 'hub:db'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  // Get all repositories where user has a subscription AND has collaborator access
  const subscriptions = await db
    .select({
      repository: schema.repositories,
      subscription: schema.repositorySubscriptions
    })
    .from(schema.repositorySubscriptions)
    .innerJoin(
      schema.repositories,
      eq(schema.repositorySubscriptions.repositoryId, schema.repositories.id)
    )
    .innerJoin(
      schema.installations,
      eq(schema.repositories.installationId, schema.installations.id)
    )
    .innerJoin(
      schema.repositoryCollaborators,
      and(
        eq(schema.repositoryCollaborators.repositoryId, schema.repositories.id),
        eq(schema.repositoryCollaborators.userId, user!.id)
      )
    )
    .where(eq(schema.repositorySubscriptions.userId, user!.id))

  return subscriptions.map(({ repository, subscription }) => ({
    id: repository.id,
    name: repository.name,
    fullName: repository.fullName,
    private: repository.private,
    description: repository.description,
    // Subscription preferences
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
