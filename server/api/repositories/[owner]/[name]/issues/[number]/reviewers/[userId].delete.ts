import { and, eq } from 'drizzle-orm'
import { db, schema } from 'hub:db'
import { Octokit } from 'octokit'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const owner = getRouterParam(event, 'owner')
  const name = getRouterParam(event, 'name')
  const numberParam = getRouterParam(event, 'number')
  const userId = getRouterParam(event, 'userId')

  if (!owner || !name || !numberParam || !userId) {
    throw createError({ statusCode: 400, message: 'Owner, name, issue number, and user ID are required' })
  }

  const issueNumber = parseInt(numberParam)
  const userIdNum = parseInt(userId)

  if (isNaN(issueNumber) || isNaN(userIdNum)) {
    throw createError({ statusCode: 400, message: 'Invalid issue number or user ID' })
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

  // Find issue by repository + number
  const issue = await db.query.issues.findFirst({
    where: and(
      eq(schema.issues.repositoryId, repository.id),
      eq(schema.issues.number, issueNumber)
    )
  })

  if (!issue) {
    throw createError({ statusCode: 404, message: 'Issue not found' })
  }

  if (!issue.pullRequest) {
    throw createError({ statusCode: 400, message: 'Reviewers can only be removed from pull requests' })
  }

  // Get user login from database
  const reviewerUser = await db.query.users.findFirst({
    where: eq(schema.users.id, userIdNum)
  })

  if (!reviewerUser) {
    throw createError({ statusCode: 404, message: 'User not found' })
  }

  // Remove reviewer on GitHub (skip in development)
  if (import.meta.dev) {
    console.log(`[DEV] Mocking GitHub API: pulls.removeRequestedReviewers for ${owner}/${name}#${issueNumber} (${reviewerUser.login})`)
  } else {
    const accessToken = await getValidAccessToken(event)
    const octokit = new Octokit({ auth: accessToken })

    try {
      await octokit.rest.pulls.removeRequestedReviewers({
        owner,
        repo: name,
        pull_number: issueNumber,
        reviewers: [reviewerUser.login]
      })
    } catch (err: any) {
      // Ignore if reviewer not found on PR
      if (err.status !== 404 && err.status !== 422) throw err
    }
  }

  // Remove from database
  await db.delete(schema.issueRequestedReviewers).where(
    and(
      eq(schema.issueRequestedReviewers.issueId, issue.id),
      eq(schema.issueRequestedReviewers.userId, userIdNum)
    )
  )

  return { success: true }
})
