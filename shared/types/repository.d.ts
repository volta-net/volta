import type { DBRepository, DBRepositorySubscription } from './db'

// Subscription preferences
export type RepositorySubscription = Pick<DBRepositorySubscription, 'issues' | 'pullRequests' | 'releases' | 'ci' | 'mentions' | 'activity'>

// Repository with optional computed fields
export interface Repository extends Omit<DBRepository, 'installationId'> {
  // Computed (for installations API)
  synced?: boolean
  // Subscription preferences (from /api/repositories)
  subscription?: RepositorySubscription
}
