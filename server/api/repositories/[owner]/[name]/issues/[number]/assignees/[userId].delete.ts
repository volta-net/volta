import { and, eq } from 'drizzle-orm'
import { db, schema } from 'hub:db'
import { Octokit } from 'octokit'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const owner = getRouterParam(event, 'owner')
  const name = getRouterParam(event, 'name')
  const numberParam = getRouterParam(event, 'number')
  const userId = getRouterParam(event, 'userId')

  if (!owner || !name || !numberParam || !userId) {
    throw createError({ statusCode: 400, message: 'Owner, name, issue number, and user ID are required' })
  }

  const issueNumber = parseInt(numberParam)
  const userIdNum = parseInt(userId)

  if (isNaN(issueNumber) || isNaN(userIdNum)) {
    throw createError({ statusCode: 400, message: 'Invalid issue number or user ID' })
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

  // Get user login from database
  const assigneeUser = await db.query.users.findFirst({
    where: eq(schema.users.id, userIdNum)
  })

  if (!assigneeUser) {
    throw createError({ statusCode: 404, message: 'User not found' })
  }

  // Remove assignee on GitHub (skip in development)
  if (import.meta.dev) {
    console.log(`[DEV] Mocking GitHub API: issues.removeAssignees for ${owner}/${name}#${issueNumber} (${assigneeUser.login})`)
  } else {
    const accessToken = await getValidAccessToken(event)
    const octokit = new Octokit({ auth: accessToken })

    try {
      await octokit.rest.issues.removeAssignees({
        owner,
        repo: name,
        issue_number: issueNumber,
        assignees: [assigneeUser.login]
      })
    } catch (err: any) {
      // Ignore if assignee not found on issue
      if (err.status !== 404) throw err
    }
  }

  // Remove from database
  await db.delete(schema.issueAssignees).where(
    and(
      eq(schema.issueAssignees.issueId, issue.id),
      eq(schema.issueAssignees.userId, userIdNum)
    )
  )

  return { success: true }
})
