import { eq, desc, and } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'

export default defineTracedEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const span = event.otel.span

  const query = getQuery(event)
  const unreadOnly = query.unread === 'true'

  // Add query parameters as span attributes
  span.setAttributes({
    'user.id': user.id,
    'query.unread_only': unreadOnly
  })

  // Build query conditions
  const conditions = [eq(schema.notifications.userId, user.id)]
  if (unreadOnly) {
    conditions.push(eq(schema.notifications.read, false))
  }

  // Use query API with relations to populate nested objects
  span.addEvent('db.query.start')
  const notifications = await db.query.notifications.findMany({
    where: and(...conditions),
    orderBy: desc(schema.notifications.createdAt),
    with: {
      repository: true,
      issue: true,
      release: true,
      workflowRun: true,
      actor: {
        columns: PRIVATE_USER_COLUMNS
      }
    }
  })
  span.addEvent('db.query.end', { 'db.result.count': notifications.length })

  // Add result count as attribute
  span.setAttribute('notifications.count', notifications.length)

  return notifications
})
