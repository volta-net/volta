import { eq, and } from 'drizzle-orm'
import { db, schema } from 'hub:db'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const issueId = Number(getRouterParam(event, 'id'))

  if (!issueId || isNaN(issueId)) {
    throw createError({
      statusCode: 400,
      message: 'Invalid issue ID'
    })
  }

  await db
    .delete(schema.favoriteIssues)
    .where(and(
      eq(schema.favoriteIssues.userId, user!.id),
      eq(schema.favoriteIssues.issueId, issueId)
    ))

  return { success: true }
})
