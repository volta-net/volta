import { and, inArray, notInArray, eq, desc, ilike, or } from 'drizzle-orm'
import { db, schema } from 'hub:db'

/**
 * Issues that are confirmed ready to be closed:
 * - AI determined the issue is answered
 * - OR have stale/wontfix/duplicate labels
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  const favoriteRepoIdsSubquery = getUserFavoriteRepoIdsSubquery(user!.id)

  // Bot users subquery
  const botUserIdsSubquery = db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(ilike(schema.users.login, '%[bot]%'))

  // Labels that indicate an issue can be closed
  const staleLabelsSubquery = db
    .select({ id: schema.labels.id })
    .from(schema.labels)
    .where(and(
      inArray(schema.labels.repositoryId, favoriteRepoIdsSubquery),
      or(
        ilike(schema.labels.name, '%stale%'),
        ilike(schema.labels.name, '%wontfix%'),
        ilike(schema.labels.name, '%won\'t fix%'),
        ilike(schema.labels.name, '%duplicate%')
      )
    ))

  // Get open issues - include answered ones and those with stale labels
  const issues = await db.query.issues.findMany({
    where: and(
      eq(schema.issues.pullRequest, false),
      eq(schema.issues.state, 'open'),
      inArray(schema.issues.repositoryId, favoriteRepoIdsSubquery),
      notInArray(schema.issues.userId, botUserIdsSubquery)
    ),
    orderBy: desc(schema.issues.updatedAt),
    with: {
      repository: true,
      user: true,
      type: true,
      labels: { with: { label: true } },
      answerComment: { with: { user: true } }
    }
  })

  // Check which issues have stale/closeable labels
  const staleIssueIdsSet = new Set(
    (await db
      .selectDistinct({ id: schema.issueLabels.issueId })
      .from(schema.issueLabels)
      .where(inArray(schema.issueLabels.labelId, staleLabelsSubquery))
    ).map(r => r.id)
  )

  // Return issues that are confirmed ready to close:
  // 1. AI determined answered
  // 2. OR have stale/wontfix/duplicate labels
  return issues
    .filter((issue) => {
      const issueAny = issue as any
      const isAnswered = issueAny.answered === true
      const hasStaleLabel = staleIssueIdsSet.has(issue.id)

      return isAnswered || hasStaleLabel
    })
    .map((issue) => {
      return {
        ...issue,
        labels: issue.labels.map(l => l.label),
        answered: issue.answered ?? false
      }
    })
})
