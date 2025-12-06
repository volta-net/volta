import { eq, and } from 'drizzle-orm'
import { db, schema } from 'hub:db'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const owner = getRouterParam(event, 'owner')
  const name = getRouterParam(event, 'name')

  if (!owner || !name) {
    throw createError({ statusCode: 400, message: 'Owner and repository name are required' })
  }

  const fullName = `${owner}/${name}`

  // Find the repository
  const [repository] = await db
    .select()
    .from(schema.repositories)
    .where(eq(schema.repositories.fullName, fullName))

  if (!repository) {
    throw createError({ statusCode: 404, message: 'Repository not found' })
  }

  // Get user's subscription
  const [subscription] = await db
    .select()
    .from(schema.repositorySubscriptions)
    .where(and(
      eq(schema.repositorySubscriptions.repositoryId, repository.id),
      eq(schema.repositorySubscriptions.userId, user!.id)
    ))

  if (!subscription) {
    return {
      subscribed: false,
      issues: false,
      pullRequests: false,
      mentions: false,
      activity: false
    }
  }

  return {
    subscribed: true,
    issues: subscription.issues,
    pullRequests: subscription.pullRequests,
    mentions: subscription.mentions,
    activity: subscription.activity
  }
})
