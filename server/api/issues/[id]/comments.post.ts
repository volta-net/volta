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

  const body = await readBody<{ body: string; owner: string; repo: string; issueNumber: number }>(event)

  if (!body.body?.trim()) {
    throw createError({ statusCode: 400, message: 'Comment body is required' })
  }

  // Get valid access token
  const accessToken = await getValidAccessToken(event)

  // Create comment on GitHub
  const octokit = new Octokit({ auth: accessToken })

  const { data: comment } = await octokit.rest.issues.createComment({
    owner: body.owner,
    repo: body.repo,
    issue_number: body.issueNumber,
    body: body.body.trim()
  })

  // Store comment in database
  await db.insert(schema.issueComments).values({
    id: comment.id,
    issueId,
    userId: user!.id,
    body: comment.body || '',
    htmlUrl: comment.html_url,
    createdAt: new Date(comment.created_at),
    updatedAt: new Date(comment.updated_at)
  })

  return { success: true, commentId: comment.id }
})
