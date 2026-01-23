import { eq, and } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const owner = getRouterParam(event, 'owner')
  const name = getRouterParam(event, 'name')

  if (!owner || !name) {
    throw createError({ statusCode: 400, message: 'Owner and repository name are required' })
  }

  const body = await readBody(event)
  const fullName = `${owner}/${name}`

  // Find the repository
  const repository = await db.query.repositories.findFirst({
    where: eq(schema.repositories.fullName, fullName)
  })

  if (!repository) {
    throw createError({ statusCode: 404, message: 'Repository not found' })
  }

  // For private repos, verify user has GitHub access (allows read/triage users to manage subscriptions)
  // Public repos are accessible to everyone, so skip the API call
  if (repository.private) {
    const accessToken = await getValidAccessToken(event)
    const hasAccess = await verifyGitHubRepoAccess(accessToken, owner, name)
    if (!hasAccess) {
      throw createError({ statusCode: 403, message: 'You do not have access to this repository' })
    }
  }

  // Check if subscription exists
  const existing = await db.query.repositorySubscriptions.findFirst({
    where: and(
      eq(schema.repositorySubscriptions.repositoryId, repository.id),
      eq(schema.repositorySubscriptions.userId, user.id)
    )
  })

  // Build update object with only the fields that were provided
  const updates: Partial<{
    issues: boolean
    pullRequests: boolean
    releases: boolean
    ci: boolean
    mentions: boolean
    activity: boolean
  }> = {}

  if (typeof body.issues === 'boolean') updates.issues = body.issues
  if (typeof body.pullRequests === 'boolean') updates.pullRequests = body.pullRequests
  if (typeof body.releases === 'boolean') updates.releases = body.releases
  if (typeof body.ci === 'boolean') updates.ci = body.ci
  if (typeof body.mentions === 'boolean') updates.mentions = body.mentions
  if (typeof body.activity === 'boolean') updates.activity = body.activity

  if (existing) {
    // Update existing subscription
    await db
      .update(schema.repositorySubscriptions)
      .set(updates)
      .where(eq(schema.repositorySubscriptions.id, existing.id))

    return {
      subscribed: true,
      issues: updates.issues ?? existing.issues,
      pullRequests: updates.pullRequests ?? existing.pullRequests,
      releases: updates.releases ?? existing.releases,
      ci: updates.ci ?? existing.ci,
      mentions: updates.mentions ?? existing.mentions,
      activity: updates.activity ?? existing.activity
    }
  } else {
    // Create new subscription with defaults (all enabled for maintainers)
    const newSubscription = {
      userId: user.id,
      repositoryId: repository.id,
      issues: updates.issues ?? true,
      pullRequests: updates.pullRequests ?? true,
      releases: updates.releases ?? true,
      ci: updates.ci ?? true,
      mentions: updates.mentions ?? true,
      activity: updates.activity ?? true
    }

    await db.insert(schema.repositorySubscriptions).values(newSubscription)

    return {
      subscribed: true,
      issues: newSubscription.issues,
      pullRequests: newSubscription.pullRequests,
      releases: newSubscription.releases,
      ci: newSubscription.ci,
      mentions: newSubscription.mentions,
      activity: newSubscription.activity
    }
  }
})
