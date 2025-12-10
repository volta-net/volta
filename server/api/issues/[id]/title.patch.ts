import { eq } from 'drizzle-orm'
import { db, schema } from 'hub:db'
import { Octokit } from 'octokit'

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, message: 'Issue ID is required' })
  }

  const issueId = parseInt(id)
  if (isNaN(issueId)) {
    throw createError({ statusCode: 400, message: 'Invalid issue ID' })
  }

  const body = await readBody<{ title: string; owner: string; repo: string; issueNumber: number }>(event)

  if (!body.title?.trim()) {
    throw createError({ statusCode: 400, message: 'Title is required' })
  }

  // Get valid access token
  const accessToken = await getValidAccessToken(event)

  // Update on GitHub
  const octokit = new Octokit({ auth: accessToken })

  await octokit.rest.issues.update({
    owner: body.owner,
    repo: body.repo,
    issue_number: body.issueNumber,
    title: body.title.trim()
  })

  // Update in database
  await db.update(schema.issues).set({
    title: body.title.trim(),
    updatedAt: new Date()
  }).where(eq(schema.issues.id, issueId))

  return { success: true }
})
