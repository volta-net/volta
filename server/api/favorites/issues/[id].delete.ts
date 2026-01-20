import { eq, and } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const issueId = Number(getRouterParam(event, 'id'))

  if (!issueId || isNaN(issueId)) {
    throw createError({
      statusCode: 400,
      message: 'Invalid issue ID'
    })
  }

  // Fetch issue to check access
  const issue = await db.query.issues.findFirst({
    where: eq(schema.issues.id, issueId)
  })

  if (!issue) {
    throw createError({
      statusCode: 404,
      message: 'Issue not found'
    })
  }

  // Check user has access to this repository
  await requireRepositoryAccess(user.id, issue.repositoryId)

  await db
    .delete(schema.favoriteIssues)
    .where(and(
      eq(schema.favoriteIssues.userId, user.id),
      eq(schema.favoriteIssues.issueId, issueId)
    ))

  return { success: true }
})
