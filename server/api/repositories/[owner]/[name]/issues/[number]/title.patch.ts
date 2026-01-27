import { eq, and } from 'drizzle-orm'
import { schema } from '@nuxthub/db'
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
  const repository = await dbs.query.repositories.findFirst({
    where: eq(schema.repositories.fullName, fullName)
  })

  if (!repository) {
    throw createError({ statusCode: 404, message: 'Repository not found' })
  }

  // Check user has access to this repository
  await requireRepositoryAccess(user.id, repository.id)

  // Find issue by repository + number
  const issue = await dbs.query.issues.findFirst({
    where: and(
      eq(schema.issues.repositoryId, repository.id),
      eq(schema.issues.number, issueNumber)
    )
  })

  if (!issue) {
    throw createError({ statusCode: 404, message: 'Issue not found' })
  }

  const body = await readBody<{ title: string }>(event)

  if (!body.title?.trim()) {
    throw createError({ statusCode: 400, message: 'Title is required' })
  }

  // Update on GitHub (skip in development)
  if (import.meta.dev) {
    console.log(`[DEV] Mocking GitHub API: issues.update (title) for ${owner}/${name}#${issueNumber}`)
  } else {
    const accessToken = await getValidAccessToken(event)
    const octokit = new Octokit({ auth: accessToken })

    await octokit.rest.issues.update({
      owner,
      repo: name,
      issue_number: issueNumber,
      title: body.title.trim()
    })
  }

  // Update in database
  await dbs.update(schema.issues).set({
    title: body.title.trim(),
    updatedAt: new Date()
  }).where(eq(schema.issues.id, issue.id))

  return { success: true }
})
