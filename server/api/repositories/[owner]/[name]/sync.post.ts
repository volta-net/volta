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

  // Start the durable workflow for repository sync
  // The workflow handles all sync steps with durability, solving serverless timeout issues
  const result = await start(syncRepositoryWorkflow, [{
    accessToken,
    owner,
    repo,
    userId: user.id
  }])

  return result
})
