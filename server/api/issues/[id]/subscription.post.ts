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
  const [issue] = await db
    .select()
    .from(schema.issues)
    .where(eq(schema.issues.id, issueId))

  if (!issue) {
    throw createError({ statusCode: 404, message: 'Issue not found' })
  }

  // Check if already subscribed
  const [existing] = await db
    .select()
    .from(schema.issueSubscriptions)
    .where(and(
      eq(schema.issueSubscriptions.issueId, issueId),
      eq(schema.issueSubscriptions.userId, user!.id)
    ))

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
