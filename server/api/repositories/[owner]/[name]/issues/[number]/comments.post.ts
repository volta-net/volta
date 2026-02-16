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

  // Check user has access (public repos are accessible to any authenticated user)
  if (repository.private) {
    await requireRepositoryAccess(user.id, repository.id)
  }

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

  const body = await readBody<{ body: string }>(event)

  if (!body.body?.trim()) {
    throw createError({ statusCode: 400, message: 'Comment body is required' })
  }

  let commentId: number
  let commentHtmlUrl: string

  // Create comment on GitHub (skip in development)
  if (import.meta.dev) {
    // Mock comment in development
    console.log(`[DEV] Mocking GitHub API: issues.createComment for ${owner}/${name}#${issueNumber}`)
    commentId = Date.now()
    commentHtmlUrl = `https://github.com/${owner}/${name}/issues/${issueNumber}#issuecomment-${commentId}`
  } else {
    const accessToken = await getValidAccessToken(event)
    const octokit = new Octokit({ auth: accessToken })

    const { data: comment } = await octokit.rest.issues.createComment({
      owner,
      repo: name,
      issue_number: issueNumber,
      body: body.body.trim()
    })

    commentId = comment.id
    commentHtmlUrl = comment.html_url
  }

  // Store comment in database
  const now = new Date()
  await db.insert(schema.issueComments).values({
    githubId: commentId,
    issueId: issue.id,
    userId: user.id,
    body: body.body.trim(),
    htmlUrl: commentHtmlUrl,
    createdAt: now,
    updatedAt: now
  })

  // Invalidate resolution cache so the next fetch triggers fresh analysis
  if (!issue.pullRequest && issue.state === 'open') {
    await db.update(schema.issues).set({
      resolutionAnalyzedAt: null
    }).where(eq(schema.issues.id, issue.id))
  }

  return { success: true, commentId }
})
