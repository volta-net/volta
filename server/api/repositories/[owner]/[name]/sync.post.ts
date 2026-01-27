import { eq } from 'drizzle-orm'
import { schema } from '@nuxthub/db'
import { start } from 'workflow/api'
import { syncRepositoryWorkflow } from '../../../../workflows/syncRepository'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const owner = getRouterParam(event, 'owner')
  const repo = getRouterParam(event, 'name')

  if (!owner || !repo) {
    throw createError({ statusCode: 400, message: 'Owner and repository name are required' })
  }

  const query = getQuery(event)
  const force = query.force === 'true'

  const accessToken = await getValidAccessToken(event)

  // Check if already syncing (prevent double-sync)
  const fullName = `${owner}/${repo}`
  const existingRepo = await dbs.query.repositories.findFirst({
    where: eq(schema.repositories.fullName, fullName),
    columns: { id: true, lastSyncedAt: true, syncing: true }
  })

  if (existingRepo?.syncing && !force) {
    // Already syncing, just return current state (unless force is true)
    return {
      started: false,
      alreadySyncing: true,
      repository: fullName
    }
  }

  // Set syncing=true BEFORE starting workflow to avoid race condition
  // This ensures the client will see syncing=true after refresh
  if (existingRepo) {
    await dbs.update(schema.repositories)
      .set({ syncing: true })
      .where(eq(schema.repositories.id, existingRepo.id))
  }

  // Start the durable workflow (fire and forget)
  // The workflow will update lastSyncedAt and set syncing=false when complete
  await start(syncRepositoryWorkflow, [{
    accessToken,
    owner,
    repo,
    userId: user.id,
    userLogin: user.username,
    existingRepoId: existingRepo?.id
  }])

  // Return immediately - frontend should poll /api/installations to detect completion
  return {
    started: true,
    repository: fullName
  }
})
