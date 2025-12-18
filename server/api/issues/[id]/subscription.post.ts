import { eq, and } from 'drizzle-orm'
import { db, schema } from 'hub:db'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, message: 'Issue ID is required' })
  }

  const issueId = parseInt(id)
  if (isNaN(issueId)) {
    throw createError({ statusCode: 400, message: 'Invalid issue ID' })
  }

  // Check if the issue exists
  const issue = await db.query.issues.findFirst({
    where: eq(schema.issues.id, issueId)
  })

  if (!issue) {
    throw createError({ statusCode: 404, message: 'Issue not found' })
  }

  // Check user has access to this repository
  await requireRepositoryAccess(user!.id, issue.repositoryId)

  // Check if already subscribed
  const existing = await db.query.issueSubscriptions.findFirst({
    where: and(
      eq(schema.issueSubscriptions.issueId, issueId),
      eq(schema.issueSubscriptions.userId, user!.id)
    )
  })

  if (existing) {
    return { subscribed: true }
  }

  // Subscribe
  await db.insert(schema.issueSubscriptions).values({
    issueId,
    userId: user!.id
  })

  return { subscribed: true }
})
