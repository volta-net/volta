import { eq, desc, and } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import { trace } from '@opentelemetry/api'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const tracer = trace.getTracer('notifications-api')

  const query = getQuery(event)
  const unreadOnly = query.unread === 'true'

  // Add query parameters as span attributes
  const span = tracer.startSpan('notifications.get', {
    attributes: {
      'user.id': user.id,
      'query.unread_only': unreadOnly
    }
  })

  try {
    // Build query conditions
    const conditions = [eq(schema.notifications.userId, user.id)]
    if (unreadOnly) {
      conditions.push(eq(schema.notifications.read, false))
    }

    // Use query API with relations to populate nested objects
    const notifications = await tracer.startActiveSpan('db.notifications.findMany', async (dbSpan) => {
      try {
        const result = await db.query.notifications.findMany({
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
        dbSpan.setAttribute('db.result.count', result.length)
        return result
      } finally {
        dbSpan.end()
      }
    })

    // Add result count as attribute
    span.setAttribute('notifications.count', notifications.length)

    return notifications
  } catch (error) {
    span.recordException(error as Error)
    throw error
  } finally {
    span.end()
  }
})
