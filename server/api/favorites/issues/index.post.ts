import { eq, and } from 'drizzle-orm'
import { db, schema } from 'hub:db'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const { issueId } = await readBody<{ issueId: number }>(event)

  if (!issueId) {
    throw createError({
      statusCode: 400,
      message: 'issueId is required'
    })
  }

  // Check if issue exists
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
  await requireRepositoryAccess(user!.id, issue.repositoryId)

  // Check if already favorited
  const existing = await db.query.favoriteIssues.findFirst({
    where: and(
      eq(schema.favoriteIssues.userId, user!.id),
      eq(schema.favoriteIssues.issueId, issueId)
    )
  })

  if (existing) {
    return { id: existing.id, issueId, alreadyExists: true }
  }

  // Create favorite
  const [favorite] = await db
    .insert(schema.favoriteIssues)
    .values({
      userId: user!.id,
      issueId
    })
    .returning()

  return { id: favorite!.id, issueId, alreadyExists: false }
})
