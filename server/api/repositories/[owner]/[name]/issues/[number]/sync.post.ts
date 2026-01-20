import { eq, and } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import { start } from 'workflow/api'
import { syncIssueWorkflow } from '../../../../../../workflows/syncIssue'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const owner = getRouterParam(event, 'owner')
  const name = getRouterParam(event, 'name')
  const numberParam = getRouterParam(event, 'number')

  if (!owner || !name || !numberParam) {
    throw createError({ statusCode: 400, message: 'Owner, name, and issue number are required' })
  }

  const issueNumber = parseInt(numberParam)
  if (isNaN(issueNumber)) {
    throw createError({ statusCode: 400, message: 'Invalid issue number' })
  }

  // Find repository by owner/name
  const fullName = `${owner}/${name}`
  const repository = await db.query.repositories.findFirst({
    where: eq(schema.repositories.fullName, fullName)
  })

  if (!repository) {
    throw createError({ statusCode: 404, message: 'Repository not found' })
  }

  // Check user has access to this repository
  await requireRepositoryAccess(user.id, repository.id)

  // Fetch issue with relations
  const issue = await db.query.issues.findFirst({
    where: and(
      eq(schema.issues.repositoryId, repository.id),
      eq(schema.issues.number, issueNumber)
    ),
    with: {
      repository: true
    }
  })

  if (!issue) {
    throw createError({ statusCode: 404, message: 'Issue not found' })
  }

  // Get valid access token (refreshes if expired)
  const accessToken = await getValidAccessToken(event)

  // Start the durable workflow to sync the issue
  // This ensures the sync completes even for issues/PRs with many comments
  await start(syncIssueWorkflow, [{
    accessToken,
    issueId: issue.id,
    repositoryFullName: repository.fullName,
    issueNumber: issue.number,
    isPullRequest: issue.pullRequest
  }])

  // Re-fetch issue with fresh data and all relations
  const freshIssue = await db.query.issues.findFirst({
    where: eq(schema.issues.id, issue.id),
    with: {
      repository: true,
      milestone: true,
      user: true,
      closedBy: true,
      mergedBy: true,
      assignees: { with: { user: true } },
      labels: { with: { label: true } },
      requestedReviewers: { with: { user: true } },
      comments: {
        with: { user: true },
        orderBy: (comments, { asc }) => [asc(comments.createdAt)]
      },
      reviews: {
        with: { user: true },
        orderBy: (reviews, { asc }) => [asc(reviews.submittedAt)]
      },
      reviewComments: {
        with: { user: true, review: true },
        orderBy: (reviewComments, { asc }) => [asc(reviewComments.createdAt)]
      }
    }
  })

  if (!freshIssue) {
    throw createError({ statusCode: 404, message: 'Issue not found after sync' })
  }

  // Check if user is subscribed to this issue
  const subscription = await db.query.issueSubscriptions.findFirst({
    where: and(
      eq(schema.issueSubscriptions.issueId, issue.id),
      eq(schema.issueSubscriptions.userId, user.id)
    )
  })

  return {
    ...freshIssue,
    assignees: freshIssue.assignees.map(a => a.user),
    labels: freshIssue.labels.map(l => l.label),
    requestedReviewers: freshIssue.requestedReviewers.map(r => r.user),
    isSubscribed: !!subscription
  }
})
