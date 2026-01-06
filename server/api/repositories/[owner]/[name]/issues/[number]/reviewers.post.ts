import { eq, and } from 'drizzle-orm'
import { db, schema } from 'hub:db'
import { Octokit } from 'octokit'

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

  // Find issue by repository + number (must be a PR)
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
    throw createError({ statusCode: 400, message: 'Reviewers can only be added to pull requests' })
  }

  const body = await readBody<{ login: string }>(event)

  if (!body.login) {
    throw createError({ statusCode: 400, message: 'User login is required' })
  }

  // Request reviewer on GitHub (skip in development)
  if (import.meta.dev) {
    console.log(`[DEV] Mocking GitHub API: pulls.requestReviewers for ${owner}/${name}#${issueNumber} (${body.login})`)
  } else {
    const accessToken = await getValidAccessToken(event)
    const octokit = new Octokit({ auth: accessToken })

    await octokit.rest.pulls.requestReviewers({
      owner,
      repo: name,
      pull_number: issueNumber,
      reviewers: [body.login]
    })
  }

  // Find user in database by login
  const reviewerUser = await db.query.users.findFirst({
    where: eq(schema.users.login, body.login)
  })

  if (reviewerUser) {
    // Add to database (ignore if already exists)
    await db.insert(schema.issueRequestedReviewers)
      .values({ issueId: issue.id, userId: reviewerUser.id })
      .onConflictDoNothing()
  }

  return { success: true }
})
