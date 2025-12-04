import { eq, and } from 'drizzle-orm'
import { db, schema } from 'hub:db'
import { Octokit } from 'octokit'

export default defineEventHandler(async (event) => {
  const { user, secure } = await requireUserSession(event)
  const owner = getRouterParam(event, 'owner')
  const repo = getRouterParam(event, 'name')

  if (!owner || !repo) {
    throw createError({ statusCode: 400, message: 'Owner and repository name are required' })
  }

  // Sync repository (runs directly without workflow for now)
  const { repository } = await syncRepositoryInfo(secure!.accessToken, owner, repo)
  const collaboratorsCount = await syncCollaborators(secure!.accessToken, owner, repo, repository.id)
  const labelsCount = await syncLabels(secure!.accessToken, owner, repo, repository.id)
  const milestonesCount = await syncMilestones(secure!.accessToken, owner, repo, repository.id)
  const issuesCount = await syncIssues(secure!.accessToken, owner, repo, repository.id)
  await updateRepositoryLastSynced(repository.id)

  // Also ensure the current user is subscribed
  // Fetch user ID from GitHub if not in session (for older sessions)
  let userId = user?.id
  if (!userId) {
    try {
      const octokit = new Octokit({ auth: secure!.accessToken })
      const { data: ghUser } = await octokit.rest.users.getAuthenticated()
      userId = ghUser.id
    } catch (error) {
      console.warn('[sync] Failed to fetch user info from GitHub:', error)
    }
  }

  if (userId) {
    try {
      const [existingSubscription] = await db
        .select()
        .from(schema.repositorySubscriptions)
        .where(and(
          eq(schema.repositorySubscriptions.userId, userId),
          eq(schema.repositorySubscriptions.repositoryId, repository.id)
        ))

      if (!existingSubscription) {
        await db.insert(schema.repositorySubscriptions).values({
          userId,
          repositoryId: repository.id,
          issues: true,
          pullRequests: true,
          mentions: true,
          activity: false
        })
      }
    } catch (error) {
      console.warn('[sync] Failed to create subscription:', error)
    }
  }

  return {
    success: true,
    repository: repository.fullName,
    synced: {
      collaborators: collaboratorsCount,
      labels: labelsCount,
      milestones: milestonesCount,
      issues: issuesCount.issues,
      pullRequests: issuesCount.pullRequests
    }
  }
})
