import { and, eq } from 'drizzle-orm'
import { db, schema } from 'hub:db'
import { Octokit } from 'octokit'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const owner = getRouterParam(event, 'owner')
  const name = getRouterParam(event, 'name')
  const numberParam = getRouterParam(event, 'number')
  const labelId = getRouterParam(event, 'labelId')

  if (!owner || !name || !numberParam || !labelId) {
    throw createError({ statusCode: 400, message: 'Owner, name, issue number, and label ID are required' })
  }

  const issueNumber = parseInt(numberParam)
  const labelIdNum = parseInt(labelId)

  if (isNaN(issueNumber) || isNaN(labelIdNum)) {
    throw createError({ statusCode: 400, message: 'Invalid issue number or label ID' })
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

  // Get label name from database
  const label = await db.query.labels.findFirst({
    where: eq(schema.labels.id, labelIdNum)
  })

  if (!label) {
    throw createError({ statusCode: 404, message: 'Label not found' })
  }

  // Remove label on GitHub (skip in development)
  if (import.meta.dev) {
    console.log(`[DEV] Mocking GitHub API: issues.removeLabel for ${owner}/${name}#${issueNumber} (${label.name})`)
  } else {
    const accessToken = await getValidAccessToken(event)
    const octokit = new Octokit({ auth: accessToken })

    try {
      await octokit.rest.issues.removeLabel({
        owner,
        repo: name,
        issue_number: issueNumber,
        name: label.name
      })
    } catch (err: any) {
      // Ignore if label not found on issue
      if (err.status !== 404) throw err
    }
  }

  // Remove from database
  await db.delete(schema.issueLabels).where(
    and(
      eq(schema.issueLabels.issueId, issue.id),
      eq(schema.issueLabels.labelId, labelIdNum)
    )
  )

  return { success: true }
})
