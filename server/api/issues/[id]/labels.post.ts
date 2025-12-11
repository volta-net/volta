import { and, eq } from 'drizzle-orm'
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

  const body = await readBody<{ labelId: number; owner: string; repo: string; issueNumber: number }>(event)

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
    console.log(`[DEV] Mocking GitHub API: issues.addLabels for ${body.owner}/${body.repo}#${body.issueNumber} (${label.name})`)
  } else {
    const accessToken = await getValidAccessToken(event)
    const octokit = new Octokit({ auth: accessToken })

    await octokit.rest.issues.addLabels({
      owner: body.owner,
      repo: body.repo,
      issue_number: body.issueNumber,
      labels: [label.name]
    })
  }

  // Check if already exists in database
  const existing = await db.query.issueLabels.findFirst({
    where: and(
      eq(schema.issueLabels.issueId, issueId),
      eq(schema.issueLabels.labelId, body.labelId)
    )
  })

  if (!existing) {
    // Add to database
    await db.insert(schema.issueLabels).values({
      issueId,
      labelId: body.labelId
    })
  }

  return { success: true }
})
