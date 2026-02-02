import { useState, computed } from '#imports'

export interface FavoriteRepository {
  id: number
  repositoryId: number
  createdAt: string
  repository: {
    id: number
    fullName: string
    private: boolean
  }
}

export interface SyncedRepository {
  id: number
  fullName: string
  private: boolean
}

export function useFavoriteRepositories() {
  const favorites = useState<FavoriteRepository[]>('favoriteRepositories', () => [])
  const synced = useState<SyncedRepository[]>('syncedRepositories', () => [])
  const open = useState('favoriteRepositoriesOpen', () => false)
  const initialized = useState('favoriteRepositoriesInitialized', () => false)

  async function refresh() {
    if (import.meta.server) return

    try {
      const [favoritesData, syncedData] = await Promise.all([
        $fetch<FavoriteRepository[]>('/api/favorites/repositories'),
        $fetch<SyncedRepository[]>('/api/repositories/synced')
      ])
      favorites.value = favoritesData ?? []
      synced.value = syncedData ?? []
    } catch {
      favorites.value = []
      synced.value = []
    }
  }

  // Auto-fetch on first use (client-side only)
  if (import.meta.client && !initialized.value) {
    initialized.value = true
    refresh()
  }

  const hasFavorites = computed(() => favorites.value.length > 0)
  const hasSynced = computed(() => synced.value.length > 0)

  return {
    favorites,
    synced,
    open,
    hasFavorites,
    hasSynced,
    refresh
  }
}
