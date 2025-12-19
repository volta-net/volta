import type { DBRepository, DBFavoriteRepository, DBFavoriteIssue, DBIssue, Serialized } from './db'

// ============================================================================
// Repository Types
// ============================================================================

// Repository list item (used for synced repositories list)
export type RepositoryListItem = Pick<DBRepository, 'id' | 'fullName' | 'private'>

// ============================================================================
// Favorite Repository Types
// ============================================================================

// Favorite repository with repository relation (serialized for API responses)
export interface FavoriteRepository extends Pick<Serialized<DBFavoriteRepository>, 'id' | 'repositoryId' | 'createdAt'> {
  repository: RepositoryListItem
}

// ============================================================================
// Favorite Issue Types
// ============================================================================

// Issue info for favorites list (serialized for API responses)
export type FavoriteIssueItem = Pick<Serialized<DBIssue>, 'id' | 'pullRequest' | 'number' | 'title' | 'state' | 'stateReason' | 'draft' | 'merged' | 'htmlUrl'> & {
  repository: Pick<DBRepository, 'id' | 'name' | 'fullName'>
}

// Favorite issue with issue and repository relation (serialized for API responses)
export interface FavoriteIssue extends Pick<Serialized<DBFavoriteIssue>, 'id' | 'issueId' | 'createdAt'> {
  issue: FavoriteIssueItem
}
