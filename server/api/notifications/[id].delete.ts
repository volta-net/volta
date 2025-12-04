import { eq, and } from 'drizzle-orm'
import { db, schema } from 'hub:db'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, message: 'Notification ID is required' })
  }

  const [notification] = await db
    .delete(schema.notifications)
    .where(and(
      eq(schema.notifications.id, parseInt(id)),
      eq(schema.notifications.userId, user!.id)
    ))
    .returning()

  if (!notification) {
    throw createError({ statusCode: 404, message: 'Notification not found' })
  }

  return { success: true }
})
