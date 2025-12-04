import { db, schema } from 'hub:db'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const body = await readBody(event)

  // Recreate notification (used for undo)
  const [notification] = await db.insert(schema.notifications).values({
    userId: user!.id,
    type: body.type,
    body: body.body,
    repositoryId: body.repositoryId,
    issueId: body.issueId,
    actorId: body.actorId,
    read: body.read ?? false
  }).returning()

  return notification
})
