import { and, inArray, eq, desc, sql, gt } from 'drizzle-orm'
import { db, schema } from 'hub:db'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  const favoriteRepoIds = await getUserFavoriteRepoIds(user!.id)
  if (favoriteRepoIds.length === 0) return []

  const issues = await db.query.issues.findMany({
    where: and(
      eq(schema.issues.pullRequest, false),
      eq(schema.issues.state, 'open'),
      inArray(schema.issues.repositoryId, favoriteRepoIds),
      gt(sql`${schema.issues.reactionCount} + ${schema.issues.commentCount}`, 5)
    ),
    orderBy: desc(sql`${schema.issues.reactionCount} + ${schema.issues.commentCount}`),
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
