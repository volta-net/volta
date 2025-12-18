import { and, inArray, notInArray, eq, desc, ilike } from 'drizzle-orm'
import { db, schema } from 'hub:db'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  const favoriteRepoIds = await getUserFavoriteRepoIds(user!.id)
  if (favoriteRepoIds.length === 0) return []

  // Get bot user IDs to exclude
  const botUsers = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(ilike(schema.users.login, '%[bot]%'))

  const botUserIds = botUsers.map(u => u.id)

  // Get open issues with labels to filter (single query with relations)
  const issues = await db.query.issues.findMany({
    where: and(
      eq(schema.issues.pullRequest, false),
      eq(schema.issues.state, 'open'),
      inArray(schema.issues.repositoryId, favoriteRepoIds),
      botUserIds.length > 0 ? notInArray(schema.issues.userId, botUserIds) : undefined
    ),
    orderBy: desc(schema.issues.createdAt),
    with: {
      repository: true,
      type: true,
      labels: { with: { label: true } }
    }
  })

  // Filter to only issues with no labels (needs triage)
  return issues
    .filter(issue => issue.labels.length === 0)
    .map(issue => ({
      ...issue,
      labels: [] // No labels by definition
    }))
})
