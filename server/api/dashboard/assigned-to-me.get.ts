import { and, inArray, eq, desc } from 'drizzle-orm'
import { db, schema } from 'hub:db'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const userId = user!.id

  const favoriteRepoIds = await getUserFavoriteRepoIds(userId)
  if (favoriteRepoIds.length === 0) return []

  // Get issue IDs where user is assigned
  const assignedIds = await db
    .select({ issueId: schema.issueAssignees.issueId })
    .from(schema.issueAssignees)
    .where(eq(schema.issueAssignees.userId, userId))

  if (assignedIds.length === 0) return []

  const issues = await db.query.issues.findMany({
    where: and(
      inArray(schema.issues.id, assignedIds.map(a => a.issueId)),
      eq(schema.issues.pullRequest, false),
      eq(schema.issues.state, 'open'),
      inArray(schema.issues.repositoryId, favoriteRepoIds)
    ),
    orderBy: desc(schema.issues.updatedAt),
    with: {
      repository: true,
      type: true,
      labels: { with: { label: true } }
    }
  })

  return issues.map(issue => ({
    ...issue,
    labels: issue.labels.map(l => l.label)
  }))
})
