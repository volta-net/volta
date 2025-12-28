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

  const body = await readBody<{ labelId: number }>(event)

  if (!body.labelId) {
    throw createError({ statusCode: 400, message: 'Label ID is required' })
  }

  // Get label name from database
  const label = await db.query.labels.findFirst({
    where: eq(schema.labels.id, body.labelId)
  })

  if (!label) {
    throw createError({ statusCode: 404, message: 'Label not found' })
  }

  // Add label on GitHub (skip in development)
  if (import.meta.dev) {
    console.log(`[DEV] Mocking GitHub API: issues.addLabels for ${owner}/${name}#${issueNumber} (${label.name})`)
  } else {
    const accessToken = await getValidAccessToken(event)
    const octokit = new Octokit({ auth: accessToken })

    await octokit.rest.issues.addLabels({
      owner,
      repo: name,
      issue_number: issueNumber,
      labels: [label.name]
    })
  }

  // Add to database (ignore if already exists)
  await db.insert(schema.issueLabels)
    .values({ issueId: issue.id, labelId: body.labelId })
    .onConflictDoNothing()

  return { success: true }
})
