import { eq } from 'drizzle-orm'
import { db, schema } from 'hub:db'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  await db
    .delete(schema.notifications)
    .where(eq(schema.notifications.userId, user!.id))

  return { success: true }
})
