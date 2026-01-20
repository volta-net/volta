import { eq, and } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import { start } from 'workflow/api'
import { syncRepositoryWorkflow } from '../../../../workflows/syncRepository'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const owner = getRouterParam(event, 'owner')
  const repo = getRouterParam(event, 'name')

  if (!owner || !repo) {
    throw createError({ statusCode: 400, message: 'Owner and repository name are required' })
  }

  const accessToken = await getValidAccessToken(event)

  // Get current lastSyncedAt before starting (for polling comparison)
  const fullName = `${owner}/${repo}`
  const existingRepo = await db.query.repositories.findFirst({
    where: eq(schema.repositories.fullName, fullName),
    columns: { lastSyncedAt: true }
  })
  const previousSyncedAt = existingRepo?.lastSyncedAt?.toISOString() ?? null

  // Start the durable workflow (fire and forget)
  // The workflow will update lastSyncedAt when complete
  await start(syncRepositoryWorkflow, [{
    accessToken,
    owner,
    repo,
    userId: user.id
  }])

  // Return immediately - frontend should poll /api/installations to detect completion
  return {
    started: true,
    repository: fullName,
    previousSyncedAt
  }
})
