import { eq } from 'drizzle-orm'
import { db, schema } from 'hub:db'
import { Octokit } from 'octokit'

export default defineEventHandler(async (event) => {
  const { secure } = await requireUserSession(event)

  const owner = getRouterParam(event, 'owner')
  const name = getRouterParam(event, 'name')

  if (!owner || !name) {
    throw createError({ statusCode: 400, message: 'Owner and repository name are required' })
  }

  const fullName = `${owner}/${name}`

  // Verify user has access to this repository on GitHub
  const octokit = new Octokit({ auth: secure!.accessToken })
  try {
    await octokit.rest.repos.get({ owner, repo: name })
  } catch {
    throw createError({ statusCode: 403, message: 'You do not have access to this repository' })
  }

  // Find the repository
  const [repository] = await db
    .select()
    .from(schema.repositories)
    .where(eq(schema.repositories.fullName, fullName))

  if (!repository) {
    throw createError({ statusCode: 404, message: 'Repository not found' })
  }

  // Delete the repository (cascade will handle issues, PRs, labels, milestones)
  await db.delete(schema.repositories).where(eq(schema.repositories.id, repository.id))

  return { success: true, repository: fullName }
})
