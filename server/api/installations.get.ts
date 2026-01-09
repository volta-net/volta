import { eq, and, inArray } from 'drizzle-orm'
import { db, schema } from 'hub:db'

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

      // Account can be a User or Enterprise - extract common fields
      const login = account && 'login' in account ? account.login : account?.name
      const type = account && 'type' in account ? account.type : 'Enterprise'

      // Default response for unsynced installation
      const defaultResponse = {
        id: installation.id,
        account: { login, avatar: account?.avatar_url, type },
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
          lastSyncedAt: null,
          createdAt: repo.created_at,
          updatedAt: repo.updated_at,
          synced: false,
          subscription: undefined
        }))
      }

      if (!accountId) return defaultResponse

      try {
        // Use db.query to fetch installation with repositories in one go
        const dbInstallation = await db.query.installations.findFirst({
          where: eq(schema.installations.accountId, accountId),
          with: {
            repositories: true
          }
        })

        if (!dbInstallation) return defaultResponse

        // Map synced repos by GitHub ID for quick lookup
        const syncedRepoMap = new Map(
          dbInstallation.repositories.map(r => [r.githubId, { id: r.id, lastSyncedAt: r.lastSyncedAt }])
        )

        // Get subscriptions for synced repos
        const subscriptionMap = new Map<number, RepositorySubscription>()
        if (dbInstallation.repositories.length > 0) {
          const repoIds = dbInstallation.repositories.map(r => r.id)
          const subscriptions = await db.query.repositorySubscriptions.findMany({
            where: and(
              eq(schema.repositorySubscriptions.userId, user.id),
              inArray(schema.repositorySubscriptions.repositoryId, repoIds)
            )
          })

          // Map subscriptions: internal repo ID -> GitHub ID
          const internalToGithubId = new Map(dbInstallation.repositories.map(r => [r.id, r.githubId]))
          for (const sub of subscriptions) {
            const githubId = internalToGithubId.get(sub.repositoryId)
            if (githubId) {
              subscriptionMap.set(githubId, {
                issues: sub.issues ?? true,
                pullRequests: sub.pullRequests ?? true,
                releases: sub.releases ?? true,
                ci: sub.ci ?? true,
                mentions: sub.mentions ?? true,
                activity: sub.activity ?? true
              })
            }
          }
        }

        return {
          id: installation.id,
          account: { login, avatar: account?.avatar_url, type },
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
      } catch (error) {
        console.warn(`[installations] Failed to fetch synced repos for account ${accountId}:`, error)
        return defaultResponse
      }
    })
  )

  return installations
})
