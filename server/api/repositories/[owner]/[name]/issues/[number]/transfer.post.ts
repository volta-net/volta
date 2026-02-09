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

  // Issues only - PRs cannot be transferred
  if (issue.pullRequest) {
    throw createError({ statusCode: 400, message: 'Pull requests cannot be transferred' })
  }

  const body = await readBody<{ newOwner: string, newRepo: string }>(event)

  if (!body.newOwner?.trim() || !body.newRepo?.trim()) {
    throw createError({ statusCode: 400, message: 'Target repository owner and name are required' })
  }

  // Transfer on GitHub
  if (import.meta.dev) {
    console.log(`[DEV] Mocking GitHub API: issues.transfer for ${owner}/${name}#${issueNumber} -> ${body.newOwner}/${body.newRepo}`)
  } else {
    const accessToken = await getValidAccessToken(event)
    const octokit = new Octokit({ auth: accessToken })

    await octokit.request('POST /repos/{owner}/{repo}/issues/{issue_number}/transfer', {
      owner,
      repo: name,
      issue_number: issueNumber,
      new_owner: body.newOwner.trim(),
      new_repo: body.newRepo.trim()
    })
  }

  // The webhook handler will take care of:
  // 1. Deleting the issue from the old repository (transferred action)
  // 2. Creating the issue in the new repository (if it's synced) via opened/edited action

  return { success: true }
})
