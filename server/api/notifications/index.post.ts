import { eq } from 'drizzle-orm'
import { db, schema } from 'hub:db'
import type { NotificationType, NotificationAction } from '~~/server/db/schema'

const validTypes: NotificationType[] = ['issue', 'pull_request', 'release', 'workflow_run']
const validActions: NotificationAction[] = [
  'opened', 'reopened', 'closed', 'merged',
  'assigned', 'mentioned', 'comment',
  'review_requested', 'review_submitted', 'review_dismissed',
  'ready_for_review',
  'published', 'failed', 'success'
]

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const body = await readBody(event)

  // Validate required fields
  if (!body.type || !validTypes.includes(body.type)) {
    throw createError({ statusCode: 400, message: 'Invalid notification type' })
  }

  if (!body.action || !validActions.includes(body.action)) {
    throw createError({ statusCode: 400, message: 'Invalid notification action' })
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

  if (body.releaseId) {
    const [release] = await db.select().from(schema.releases).where(eq(schema.releases.id, body.releaseId))
    if (!release) {
      throw createError({ statusCode: 400, message: 'Invalid release ID' })
    }
  }

  if (body.workflowRunId) {
    const [workflowRun] = await db.select().from(schema.workflowRuns).where(eq(schema.workflowRuns.id, body.workflowRunId))
    if (!workflowRun) {
      throw createError({ statusCode: 400, message: 'Invalid workflow run ID' })
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
    action: body.action as NotificationAction,
    body: body.body,
    repositoryId: body.repositoryId,
    issueId: body.issueId,
    releaseId: body.releaseId,
    workflowRunId: body.workflowRunId,
    actorId: body.actorId,
    read: body.read ?? false
  }).returning()

  return notification
})
