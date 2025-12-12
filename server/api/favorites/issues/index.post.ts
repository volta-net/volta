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
  const [issue] = await db
    .select()
    .from(schema.issues)
    .where(eq(schema.issues.id, issueId))

  if (!issue) {
    throw createError({
      statusCode: 404,
      message: 'Issue not found'
    })
  }

  // Check if already favorited
  const [existing] = await db
    .select()
    .from(schema.favoriteIssues)
    .where(and(
      eq(schema.favoriteIssues.userId, user!.id),
      eq(schema.favoriteIssues.issueId, issueId)
    ))

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

  return { id: favorite.id, issueId, alreadyExists: false }
})
