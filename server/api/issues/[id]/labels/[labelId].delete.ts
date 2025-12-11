import { and, eq } from 'drizzle-orm'
import { db, schema } from 'hub:db'
import { Octokit } from 'octokit'

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const id = getRouterParam(event, 'id')
  const labelId = getRouterParam(event, 'labelId')

  if (!id || !labelId) {
    throw createError({ statusCode: 400, message: 'Issue ID and Label ID are required' })
  }

  const issueId = parseInt(id)
  const labelIdNum = parseInt(labelId)

  if (isNaN(issueId) || isNaN(labelIdNum)) {
    throw createError({ statusCode: 400, message: 'Invalid issue or label ID' })
  }

  const body = await readBody<{ owner: string; repo: string; issueNumber: number }>(event)

  // Get label name from database
  const label = await db.query.labels.findFirst({
    where: eq(schema.labels.id, labelIdNum)
  })

  if (!label) {
    throw createError({ statusCode: 404, message: 'Label not found' })
  }

  // Remove label on GitHub (skip in development)
  if (import.meta.dev) {
    console.log(`[DEV] Mocking GitHub API: issues.removeLabel for ${body.owner}/${body.repo}#${body.issueNumber} (${label.name})`)
  } else {
    const accessToken = await getValidAccessToken(event)
    const octokit = new Octokit({ auth: accessToken })

    try {
      await octokit.rest.issues.removeLabel({
        owner: body.owner,
        repo: body.repo,
        issue_number: body.issueNumber,
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
      eq(schema.issueLabels.issueId, issueId),
      eq(schema.issueLabels.labelId, labelIdNum)
    )
  )

  return { success: true }
})
