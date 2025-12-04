export interface Repository {
  id: number
  name: string
  fullName: string
  private: boolean | null
  description: string | null
  htmlUrl: string | null
  defaultBranch: string | null
  archived: boolean | null
  disabled: boolean | null
  // Volta-specific
  syncEnabled: boolean | null
  lastSyncedAt: Date | string | null
  createdAt: Date | string | null
  updatedAt: Date | string | null
  // Computed (for installations API)
  synced?: boolean
}
