import { eq, and } from 'drizzle-orm'
import { db, schema } from 'hub:db'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  await db
    .delete(schema.notifications)
    .where(and(
      eq(schema.notifications.userId, user.id),
      eq(schema.notifications.read, true)
    ))

  return { success: true }
})
