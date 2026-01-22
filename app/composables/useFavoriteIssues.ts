export interface FavoriteIssue {
  id: number
  issueId: number
  createdAt: string
  issue: {
    id: number
    pullRequest: boolean
    number: number
    title: string
    state: string
    stateReason: string | null
    draft: boolean | null
    merged: boolean | null
    htmlUrl: string | null
    repository: {
      id: number
      name: string
      fullName: string
    }
  }
}

export function useFavoriteIssues() {
  const favorites = useState<FavoriteIssue[]>('favoriteIssues', () => [])
  const open = useState('favoriteIssuesOpen', () => false)
  const selectedIssue = useState<FavoriteIssue['issue'] | null>('favoriteIssuesSelected', () => null)
  const initialized = useState('favoriteIssuesInitialized', () => false)

  async function refresh() {
    if (import.meta.server) return

    try {
      favorites.value = await $fetch<FavoriteIssue[]>('/api/favorites/issues') ?? []
    } catch {
      favorites.value = []
    }
  }

  // Auto-fetch on first use (client-side only)
  if (import.meta.client && !initialized.value) {
    initialized.value = true
    refresh()
  }

  function selectIssue(issue: FavoriteIssue['issue']) {
    selectedIssue.value = issue
  }

  function clearSelection() {
    selectedIssue.value = null
  }

  return {
    favorites,
    open,
    selectedIssue,
    refresh,
    selectIssue,
    clearSelection
  }
}
