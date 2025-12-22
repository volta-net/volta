import type { DBRepository, DBFavoriteRepository, DBFavoriteIssue, DBIssue, Serialized } from './db'

// ============================================================================
// Favorite Repository Types
// ============================================================================

export interface FavoriteRepository extends Pick<Serialized<DBFavoriteRepository>, 'id' | 'repositoryId' | 'createdAt'> {
  repository: Pick<DBRepository, 'id' | 'fullName' | 'private'>
}

// ============================================================================
// Favorite Issue Types
// ============================================================================

export interface FavoriteIssue extends Pick<Serialized<DBFavoriteIssue>, 'id' | 'issueId' | 'createdAt'> {
  issue: Pick<DBIssue, 'id'>
}
