import { eq, and } from 'drizzle-orm'
import { db, schema } from 'hub:db'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  await db
    .update(schema.notifications)
    .set({
      read: true,
      readAt: new Date()
    })
    .where(and(
      eq(schema.notifications.userId, user!.id),
      eq(schema.notifications.read, false)
    ))

  return { success: true }
})
