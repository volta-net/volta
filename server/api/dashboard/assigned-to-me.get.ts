import { and, inArray, eq, desc } from 'drizzle-orm'
import { db, schema } from 'hub:db'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const userId = user!.id

  // Use subqueries for single-query filtering
  const issues = await db.query.issues.findMany({
    where: and(
      inArray(
        schema.issues.id,
        db.select({ id: schema.issueAssignees.issueId })
          .from(schema.issueAssignees)
          .where(eq(schema.issueAssignees.userId, userId))
      ),
      eq(schema.issues.pullRequest, false),
      eq(schema.issues.state, 'open'),
      inArray(schema.issues.repositoryId, getUserFavoriteRepoIdsSubquery(userId))
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
