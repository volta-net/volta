export interface Installation {
  id: number
  account: {
    login: string | undefined
    avatar: string | undefined
    type: string | undefined
  }
  repositories: Repository[]
}

export interface Repository {
  id: number
  name: string
  fullName: string
  private: boolean
  description: string | null
  url: string
  defaultBranch: string
  updatedAt: string | null
  // Sync status
  synced: boolean
  lastSyncedAt: string | null
}
