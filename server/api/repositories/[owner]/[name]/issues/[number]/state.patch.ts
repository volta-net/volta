import { eq, and } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
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

  // PRs cannot be closed/reopened via this endpoint
  if (issue.pullRequest) {
    throw createError({ statusCode: 400, message: 'Pull requests cannot be closed/reopened via this endpoint' })
  }

  const body = await readBody<{ state: 'open' | 'closed', stateReason?: 'completed' | 'not_planned' | 'reopened' | null, duplicateOf?: number }>(event)

  if (!body.state || !['open', 'closed'].includes(body.state)) {
    throw createError({ statusCode: 400, message: 'Valid state (open or closed) is required' })
  }

  // Update on GitHub (skip in development)
  if (import.meta.dev) {
    console.log(`[DEV] Mocking GitHub API: issues.update (state) for ${owner}/${name}#${issueNumber}`)
  } else {
    const accessToken = await getValidAccessToken(event)
    const octokit = new Octokit({ auth: accessToken })

    await octokit.rest.issues.update({
      owner,
      repo: name,
      issue_number: issueNumber,
      state: body.state,
      state_reason: body.stateReason ?? undefined
    })

    // If closing as duplicate, add a comment referencing the duplicate issue
    if (body.state === 'closed' && body.stateReason === 'not_planned' && body.duplicateOf) {
      await octokit.rest.issues.createComment({
        owner,
        repo: name,
        issue_number: issueNumber,
        body: `Duplicate of #${body.duplicateOf}`
      })
    }
  }

  // Update in database
  await db.update(schema.issues).set({
    state: body.state,
    stateReason: body.stateReason ?? null,
    updatedAt: new Date()
  }).where(eq(schema.issues.id, issue.id))

  return { success: true }
})
