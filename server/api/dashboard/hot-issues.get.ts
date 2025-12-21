import { and, inArray, notInArray, eq, desc, sql, gt, ilike } from 'drizzle-orm'
import { db, schema } from 'hub:db'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  const favoriteRepoIdsSubquery = getUserFavoriteRepoIdsSubquery(user!.id)

  // Bot users subquery
  const botUserIdsSubquery = db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(ilike(schema.users.login, '%[bot]%'))

  // Exclude issues with bug labels
  const bugLabelIdsSubquery = db
    .select({ id: schema.labels.id })
    .from(schema.labels)
    .where(and(
      inArray(schema.labels.repositoryId, favoriteRepoIdsSubquery),
      ilike(schema.labels.name, '%bug%')
    ))

  const bugIssueIdsFromLabels = db
    .selectDistinct({ id: schema.issueLabels.issueId })
    .from(schema.issueLabels)
    .where(inArray(schema.issueLabels.labelId, bugLabelIdsSubquery))

  // Exclude issues with Bug type
  const bugIssueIdsFromType = db
    .selectDistinct({ id: schema.issues.id })
    .from(schema.issues)
    .innerJoin(schema.types, eq(schema.issues.typeId, schema.types.id))
    .where(and(
      inArray(schema.issues.repositoryId, favoriteRepoIdsSubquery),
      ilike(schema.types.name, 'bug')
    ))

  const issues = await db.query.issues.findMany({
    where: and(
      eq(schema.issues.pullRequest, false),
      eq(schema.issues.state, 'open'),
      inArray(schema.issues.repositoryId, favoriteRepoIdsSubquery),
      notInArray(schema.issues.userId, botUserIdsSubquery),
      notInArray(schema.issues.id, bugIssueIdsFromLabels),
      notInArray(schema.issues.id, bugIssueIdsFromType),
      gt(sql`${schema.issues.reactionCount} + ${schema.issues.commentCount}`, 5)
    ),
    orderBy: desc(sql`${schema.issues.reactionCount} + ${schema.issues.commentCount}`),
    with: {
      repository: true,
      user: true,
      type: true,
      labels: { with: { label: true } }
    }
  })

  return issues.map(issue => ({
    ...issue,
    labels: issue.labels.map(l => l.label)
  }))
})
