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

  let commentId: number
  let commentHtmlUrl: string

  // Create comment on GitHub (skip in development)
  if (import.meta.dev) {
    // Mock comment in development
    console.log(`[DEV] Mocking GitHub API: issues.createComment for ${body.owner}/${body.repo}#${body.issueNumber}`)
    commentId = Date.now()
    commentHtmlUrl = `https://github.com/${body.owner}/${body.repo}/issues/${body.issueNumber}#issuecomment-${commentId}`
  } else {
    const accessToken = await getValidAccessToken(event)
    const octokit = new Octokit({ auth: accessToken })

    const { data: comment } = await octokit.rest.issues.createComment({
      owner: body.owner,
      repo: body.repo,
      issue_number: body.issueNumber,
      body: body.body.trim()
    })

    commentId = comment.id
    commentHtmlUrl = comment.html_url
  }

  // Store comment in database
  const now = new Date()
  await db.insert(schema.issueComments).values({
    id: commentId,
    issueId,
    userId: user!.id,
    body: body.body.trim(),
    htmlUrl: commentHtmlUrl,
    createdAt: now,
    updatedAt: now
  })

  return { success: true, commentId }
})
