import { eq } from 'drizzle-orm'
import { db, schema } from 'hub:db'
import { Octokit } from 'octokit'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, message: 'Issue ID is required' })
  }

  const issueId = parseInt(id)
  if (isNaN(issueId)) {
    throw createError({ statusCode: 400, message: 'Invalid issue ID' })
  }

  // Fetch issue to check access
  const issue = await db.query.issues.findFirst({
    where: eq(schema.issues.id, issueId)
  })

  if (!issue) {
    throw createError({ statusCode: 404, message: 'Issue not found' })
  }

  // Check user has access to this repository
  await requireRepositoryAccess(user.id, issue.repositoryId)

  const body = await readBody<{ body: string, owner: string, repo: string, issueNumber: number }>(event)

  // Update on GitHub (skip in development)
  if (import.meta.dev) {
    console.log(`[DEV] Mocking GitHub API: issues.update (body) for ${body.owner}/${body.repo}#${body.issueNumber}`)
  } else {
    const accessToken = await getValidAccessToken(event)
    const octokit = new Octokit({ auth: accessToken })

    await octokit.rest.issues.update({
      owner: body.owner,
      repo: body.repo,
      issue_number: body.issueNumber,
      body: body.body
    })
  }

  // Update in database
  await db.update(schema.issues).set({
    body: body.body,
    updatedAt: new Date()
  }).where(eq(schema.issues.id, issueId))

  return { success: true }
})
