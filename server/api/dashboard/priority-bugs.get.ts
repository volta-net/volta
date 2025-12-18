import { eq, and, inArray, notInArray, desc, ilike, sql } from 'drizzle-orm'
import { db, schema } from 'hub:db'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  const favoriteRepoIds = await getUserFavoriteRepoIds(user!.id)
  if (favoriteRepoIds.length === 0) return []

  // Get bug label IDs
  const bugLabels = await db
    .select({ id: schema.labels.id })
    .from(schema.labels)
    .where(and(
      inArray(schema.labels.repositoryId, favoriteRepoIds),
      ilike(schema.labels.name, '%bug%')
    ))

  const bugLabelIds = bugLabels.map(l => l.id)

  // Get issue IDs that have bug labels
  let bugIssueIds: number[] = []
  if (bugLabelIds.length > 0) {
    const issuesWithBugLabels = await db
      .selectDistinct({ issueId: schema.issueLabels.issueId })
      .from(schema.issueLabels)
      .where(inArray(schema.issueLabels.labelId, bugLabelIds))

    bugIssueIds = issuesWithBugLabels.map(i => i.issueId)
  }

  // Get issue IDs that have Bug issue type
  const issuesWithBugType = await db
    .selectDistinct({ issueId: schema.issues.id })
    .from(schema.issues)
    .innerJoin(schema.types, eq(schema.issues.typeId, schema.types.id))
    .where(and(
      inArray(schema.issues.repositoryId, favoriteRepoIds),
      ilike(schema.types.name, 'bug')
    ))

  const bugTypeIssueIds = issuesWithBugType.map(i => i.issueId)

  // Get triage label IDs to exclude
  const triageLabels = await db
    .select({ id: schema.labels.id })
    .from(schema.labels)
    .where(and(
      inArray(schema.labels.repositoryId, favoriteRepoIds),
      ilike(schema.labels.name, '%triage%')
    ))

  const triageLabelIds = triageLabels.map(l => l.id)

  // Get issue IDs that have triage labels (to exclude)
  let triageIssueIds: number[] = []
  if (triageLabelIds.length > 0) {
    const issuesWithTriageLabels = await db
      .selectDistinct({ issueId: schema.issueLabels.issueId })
      .from(schema.issueLabels)
      .where(inArray(schema.issueLabels.labelId, triageLabelIds))

    triageIssueIds = issuesWithTriageLabels.map(i => i.issueId)
  }

  // Combine bug issue IDs from labels and issue types
  const allBugIssueIds = [...new Set([...bugIssueIds, ...bugTypeIssueIds])]
  if (allBugIssueIds.length === 0) return []

  // Query issues that either have Bug issue type or bug label
  const issues = await db.query.issues.findMany({
    where: and(
      eq(schema.issues.pullRequest, false),
      eq(schema.issues.state, 'open'),
      inArray(schema.issues.repositoryId, favoriteRepoIds),
      inArray(schema.issues.id, allBugIssueIds),
      triageIssueIds.length > 0 ? notInArray(schema.issues.id, triageIssueIds) : undefined
    ),
    orderBy: [
      desc(sql`${schema.issues.reactionCount} + ${schema.issues.commentCount}`),
      desc(schema.issues.updatedAt)
    ],
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
