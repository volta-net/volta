import { eq, desc, and } from 'drizzle-orm'
import { db, schema } from 'hub:db'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  const query = getQuery(event)
  const unreadOnly = query.unread === 'true'

  // Build query conditions
  const conditions = [eq(schema.notifications.userId, user.id)]
  if (unreadOnly) {
    conditions.push(eq(schema.notifications.read, false))
  }

  // Use query API with relations to populate nested objects
  const notifications = await db.query.notifications.findMany({
    where: and(...conditions),
    orderBy: desc(schema.notifications.createdAt),
    limit: 50,
    with: {
      repository: true,
      issue: true,
      release: true,
      workflowRun: true,
      actor: true
    }
  })

  return notifications
})
