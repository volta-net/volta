import { eq, and, inArray } from 'drizzle-orm'
import { db, schema } from 'hub:db'
import type { RepositorySubscription } from '#shared/types/repository'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  const accessToken = await getValidAccessToken(event)
  const octokit = useOctokitWithToken(accessToken)

  // Get all installations accessible to the user (paginated)
  const allInstallations = await octokit.paginate(
    octokit.rest.apps.listInstallationsForAuthenticatedUser,
    { per_page: 100 }
  )

  const installations = await Promise.all(
    allInstallations.map(async (installation) => {
      // Get all repositories for each installation (paginated)
      const allRepos = await octokit.paginate(
        octokit.rest.apps.listInstallationReposForAuthenticatedUser,
        {
          installation_id: installation.id,
          per_page: 100
        }
      )

      const account = installation.account
      const accountId = account?.id

      // Get synced repositories for this installation from database
      // Note: We use accountId as installationId when syncing (not the GitHub App installation ID)
      let syncedRepoMap = new Map<number, { lastSyncedAt: Date | null }>()
      let subscriptionMap = new Map<number, RepositorySubscription>()

      if (accountId) {
        try {
          const syncedRepos = await db.select({
            id: schema.repositories.id,
            lastSyncedAt: schema.repositories.lastSyncedAt
          }).from(schema.repositories).where(eq(schema.repositories.installationId, accountId))

          syncedRepoMap = new Map(syncedRepos.map(r => [r.id, { lastSyncedAt: r.lastSyncedAt }]))

          // Get subscriptions for synced repos (filter by repo IDs and user)
          if (syncedRepos.length > 0) {
            const syncedRepoIds = syncedRepos.map(r => r.id)
            const subscriptions = await db.select({
              repositoryId: schema.repositorySubscriptions.repositoryId,
              issues: schema.repositorySubscriptions.issues,
              pullRequests: schema.repositorySubscriptions.pullRequests,
              releases: schema.repositorySubscriptions.releases,
              ci: schema.repositorySubscriptions.ci,
              mentions: schema.repositorySubscriptions.mentions,
              activity: schema.repositorySubscriptions.activity
            })
              .from(schema.repositorySubscriptions)
              .where(and(
                eq(schema.repositorySubscriptions.userId, user!.id),
                inArray(schema.repositorySubscriptions.repositoryId, syncedRepoIds)
              ))

            subscriptionMap = new Map(subscriptions.map(s => [s.repositoryId, {
              issues: s.issues ?? true,
              pullRequests: s.pullRequests ?? true,
              releases: s.releases ?? true,
              ci: s.ci ?? true,
              mentions: s.mentions ?? true,
              activity: s.activity ?? true
            }]))
          }
        } catch (error) {
          console.warn(`[installations] Failed to fetch synced repos for account ${accountId}:`, error)
        }
      }
      // Account can be a User or Enterprise - extract common fields
      const login = account && 'login' in account ? account.login : account?.name
      const type = account && 'type' in account ? account.type : 'Enterprise'

      return {
        id: installation.id,
        account: {
          login,
          avatar: account?.avatar_url,
          type
        },
        repositories: allRepos.map(repo => ({
          id: repo.id,
          name: repo.name,
          fullName: repo.full_name,
          private: repo.private,
          description: repo.description,
          htmlUrl: repo.html_url,
          defaultBranch: repo.default_branch,
          archived: repo.archived,
          disabled: repo.disabled,
          syncEnabled: null,
          lastSyncedAt: syncedRepoMap.get(repo.id)?.lastSyncedAt?.toISOString() ?? null,
          createdAt: repo.created_at,
          updatedAt: repo.updated_at,
          synced: syncedRepoMap.has(repo.id),
          subscription: subscriptionMap.get(repo.id)
        }))
      }
    })
  )

  return installations
})
