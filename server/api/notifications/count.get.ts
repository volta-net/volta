import { eq, and, count } from 'drizzle-orm'
import { db, schema } from 'hub:db'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  const [result] = await db
    .select({ count: count() })
    .from(schema.notifications)
    .where(and(
      eq(schema.notifications.userId, user!.id),
      eq(schema.notifications.read, false)
    ))

  return { unread: result?.count || 0 }
})
