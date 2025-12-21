import { eq, and, inArray, notInArray, desc, ilike, sql } from 'drizzle-orm'
import { db, schema } from 'hub:db'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  const favoriteRepoIdsSubquery = getUserFavoriteRepoIdsSubquery(user!.id)

  // Bot users subquery
  const botUserIdsSubquery = db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(ilike(schema.users.login, '%[bot]%'))

  // Get issue IDs with bug labels (using subqueries)
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

  // Get issue IDs with Bug type (using subquery)
  const bugIssueIdsFromType = db
    .selectDistinct({ id: schema.issues.id })
    .from(schema.issues)
    .innerJoin(schema.types, eq(schema.issues.typeId, schema.types.id))
    .where(and(
      inArray(schema.issues.repositoryId, favoriteRepoIdsSubquery),
      ilike(schema.types.name, 'bug')
    ))

  // Get triage issue IDs to exclude (using subqueries)
  const triageLabelIdsSubquery = db
    .select({ id: schema.labels.id })
    .from(schema.labels)
    .where(and(
      inArray(schema.labels.repositoryId, favoriteRepoIdsSubquery),
      ilike(schema.labels.name, '%triage%')
    ))

  const triageIssueIdsSubquery = db
    .selectDistinct({ id: schema.issueLabels.issueId })
    .from(schema.issueLabels)
    .where(inArray(schema.issueLabels.labelId, triageLabelIdsSubquery))

  // Query issues that have Bug type or bug label, excluding triage and bots
  const issues = await db.query.issues.findMany({
    where: and(
      eq(schema.issues.pullRequest, false),
      eq(schema.issues.state, 'open'),
      inArray(schema.issues.repositoryId, favoriteRepoIdsSubquery),
      notInArray(schema.issues.userId, botUserIdsSubquery),
      sql`(${inArray(schema.issues.id, bugIssueIdsFromLabels)} OR ${inArray(schema.issues.id, bugIssueIdsFromType)})`,
      notInArray(schema.issues.id, triageIssueIdsSubquery)
    ),
    orderBy: [
      desc(sql`${schema.issues.reactionCount} + ${schema.issues.commentCount}`),
      desc(schema.issues.updatedAt)
    ],
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
