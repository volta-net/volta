import { eq } from 'drizzle-orm'
import { db, schema } from 'hub:db'
import type { NotificationType } from '~~/server/db/schema'

const validTypes: NotificationType[] = [
  'issue_opened', 'issue_reopened', 'issue_closed', 'issue_assigned', 'issue_mentioned', 'issue_comment',
  'pr_opened', 'pr_reopened', 'pr_review_requested', 'pr_review_submitted', 'pr_comment', 'pr_merged', 'pr_closed'
]

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const body = await readBody(event)

  // Validate required fields
  if (!body.type || !validTypes.includes(body.type)) {
    throw createError({ statusCode: 400, message: 'Invalid notification type' })
  }

  // Validate foreign keys exist (prevent referencing non-existent entities)
  if (body.repositoryId) {
    const [repo] = await db.select().from(schema.repositories).where(eq(schema.repositories.id, body.repositoryId))
    if (!repo) {
      throw createError({ statusCode: 400, message: 'Invalid repository ID' })
    }
  }

  if (body.issueId) {
    const [issue] = await db.select().from(schema.issues).where(eq(schema.issues.id, body.issueId))
    if (!issue) {
      throw createError({ statusCode: 400, message: 'Invalid issue ID' })
    }
  }

  // Validate actor exists (prevent spoofing non-existent users)
  if (body.actorId) {
    const [actor] = await db.select().from(schema.users).where(eq(schema.users.id, body.actorId))
    if (!actor) {
      throw createError({ statusCode: 400, message: 'Invalid actor ID' })
    }
  }

  // Recreate notification (used for undo)
  const [notification] = await db.insert(schema.notifications).values({
    userId: user!.id,
    type: body.type as NotificationType,
    body: body.body,
    repositoryId: body.repositoryId,
    issueId: body.issueId,
    actorId: body.actorId,
    read: body.read ?? false
  }).returning()

  return notification
})
