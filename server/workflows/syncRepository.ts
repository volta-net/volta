export interface SyncRepositoryInput {
  accessToken: string
  owner: string
  repo: string
  userId: number
}

export interface SyncRepositoryResult {
  success: boolean
  repository: string
  synced: {
    collaborators: number
    labels: number
    milestones: number
    types: number
    issues: number
    pullRequests: number
  }
}

// Step functions with dynamic imports to avoid Node.js module issues in workflow context

async function stepSyncRepositoryInfo(accessToken: string, owner: string, repo: string) {
  'use step'
  const { syncRepositoryInfo } = await import('../utils/sync.js')
  const { eq } = await import('drizzle-orm')
  const { db, schema } = await import('@nuxthub/db')
  console.log(`[Workflow] Step 1: Syncing repository info for ${owner}/${repo}`)
  const result = await syncRepositoryInfo(accessToken, owner, repo)
  // Mark as syncing
  await db.update(schema.repositories).set({ syncing: true }).where(eq(schema.repositories.id, result.repository.id))
  return result
}

async function stepSyncCollaborators(accessToken: string, owner: string, repo: string, repositoryId: number) {
  'use step'
  const { syncCollaborators } = await import('../utils/sync.js')
  console.log(`[Workflow] Step 2: Syncing collaborators for ${owner}/${repo}`)
  return await syncCollaborators(accessToken, owner, repo, repositoryId)
}

async function stepVerifyAccess(userId: number, repositoryId: number) {
  'use step'
  const { eq, and } = await import('drizzle-orm')
  const { db, schema } = await import('@nuxthub/db')
  console.log(`[Workflow] Step 3: Verifying user access for repository ${repositoryId}`)
  const collaborator = await db.query.repositoryCollaborators.findFirst({
    where: and(
      eq(schema.repositoryCollaborators.repositoryId, repositoryId),
      eq(schema.repositoryCollaborators.userId, userId)
    )
  })
  if (!collaborator) {
    throw new Error(`User ${userId} does not have access to repository ${repositoryId}`)
  }
}

async function stepSyncLabels(accessToken: string, owner: string, repo: string, repositoryId: number) {
  'use step'
  const { syncLabels } = await import('../utils/sync.js')
  console.log(`[Workflow] Step 4: Syncing labels for ${owner}/${repo}`)
  return await syncLabels(accessToken, owner, repo, repositoryId)
}

async function stepSyncMilestones(accessToken: string, owner: string, repo: string, repositoryId: number) {
  'use step'
  const { syncMilestones } = await import('../utils/sync.js')
  console.log(`[Workflow] Step 5: Syncing milestones for ${owner}/${repo}`)
  return await syncMilestones(accessToken, owner, repo, repositoryId)
}

async function stepSyncTypes(accessToken: string, owner: string, repo: string, repositoryId: number) {
  'use step'
  const { syncTypes } = await import('../utils/sync.js')
  console.log(`[Workflow] Step 6: Syncing types for ${owner}/${repo}`)
  return await syncTypes(accessToken, owner, repo, repositoryId)
}

async function stepSyncIssues(accessToken: string, owner: string, repo: string, repositoryId: number) {
  'use step'
  const { syncIssues } = await import('../utils/sync.js')
  console.log(`[Workflow] Step 7: Syncing issues and PRs for ${owner}/${repo}`)
  return await syncIssues(accessToken, owner, repo, repositoryId)
}

async function stepUpdateLastSynced(repositoryId: number) {
  'use step'
  const { eq } = await import('drizzle-orm')
  const { db, schema } = await import('@nuxthub/db')
  console.log(`[Workflow] Step 8: Updating last synced timestamp and clearing syncing flag`)
  await db.update(schema.repositories).set({
    lastSyncedAt: new Date(),
    syncing: false
  }).where(eq(schema.repositories.id, repositoryId))
}

async function stepEnsureSubscription(userId: number, repositoryId: number) {
  'use step'
  const { eq, and } = await import('drizzle-orm')
  const { db, schema } = await import('@nuxthub/db')
  console.log(`[Workflow] Step 9: Ensuring user subscription`)
  const existingSubscription = await db.query.repositorySubscriptions.findFirst({
    where: and(
      eq(schema.repositorySubscriptions.userId, userId),
      eq(schema.repositorySubscriptions.repositoryId, repositoryId)
    )
  })

  if (!existingSubscription) {
    await db.insert(schema.repositorySubscriptions).values({
      userId,
      repositoryId,
      issues: true,
      pullRequests: true,
      releases: true,
      ci: true,
      mentions: true,
      activity: true
    })
  }
}

async function stepClearSyncingFlag(repositoryId: number) {
  'use step'
  const { eq } = await import('drizzle-orm')
  const { db, schema } = await import('@nuxthub/db')
  console.log(`[Workflow] Clearing syncing flag for repository ${repositoryId}`)
  await db.update(schema.repositories).set({ syncing: false }).where(eq(schema.repositories.id, repositoryId))
}

/**
 * Durable workflow to sync a GitHub repository.
 * Each step is independently resumable, solving serverless timeout issues.
 */
export async function syncRepositoryWorkflow(input: SyncRepositoryInput): Promise<SyncRepositoryResult> {
  'use workflow'
  const { accessToken, owner, repo, userId } = input

  let repositoryId: number | null = null

  try {
    // Step 1: Sync repository info and get repository ID
    const { repository } = await stepSyncRepositoryInfo(accessToken, owner, repo)
    repositoryId = repository.id

    // Step 2: Sync collaborators (needed for access verification)
    const collaboratorsCount = await stepSyncCollaborators(accessToken, owner, repo, repository.id)

    // Step 3: Verify user has access (must be after syncCollaborators for first-time sync)
    await stepVerifyAccess(userId, repository.id)

    // Step 4: Sync labels
    const labelsCount = await stepSyncLabels(accessToken, owner, repo, repository.id)

    // Step 5: Sync milestones
    const milestonesCount = await stepSyncMilestones(accessToken, owner, repo, repository.id)

    // Step 6: Sync types (organization issue types)
    const typesCount = await stepSyncTypes(accessToken, owner, repo, repository.id)

    // Step 7: Sync issues and PRs (the longest operation)
    const issuesCount = await stepSyncIssues(accessToken, owner, repo, repository.id)

    // Step 8: Update last synced timestamp (also clears syncing flag)
    await stepUpdateLastSynced(repository.id)

    // Step 9: Ensure user subscription exists
    await stepEnsureSubscription(userId, repository.id)

    console.log(`[Workflow] Repository sync completed for ${owner}/${repo}`)

    return {
      success: true,
      repository: repository.fullName,
      synced: {
        collaborators: collaboratorsCount,
        labels: labelsCount,
        milestones: milestonesCount,
        types: typesCount,
        issues: issuesCount.issues,
        pullRequests: issuesCount.pullRequests
      }
    }
  } catch (error) {
    // Clear syncing flag on error to prevent stuck state
    if (repositoryId) {
      await stepClearSyncingFlag(repositoryId)
    }
    throw error
  }
}
