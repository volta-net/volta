import { eq } from 'drizzle-orm'
import { db, schema } from 'hub:db'
import type { Installation } from '#shared/types/installation'

export default defineEventHandler(async (event): Promise<Installation[]> => {
  const { secure } = await requireUserSession(event)

  const octokit = useOctokitWithToken(secure!.accessToken)

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
      let syncedRepoMap = new Map<number, Date | null>()
      if (accountId) {
        try {
          const syncedRepos = await db.select({
            id: schema.repositories.id,
            lastSyncedAt: schema.repositories.lastSyncedAt
          }).from(schema.repositories).where(eq(schema.repositories.installationId, accountId))

          syncedRepoMap = new Map(syncedRepos.map(r => [r.id, r.lastSyncedAt]))
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
          lastSyncedAt: syncedRepoMap.get(repo.id)?.toISOString() ?? null,
          createdAt: repo.created_at,
          updatedAt: repo.updated_at,
          synced: syncedRepoMap.has(repo.id)
        }))
      }
    })
  )

  return installations
})
