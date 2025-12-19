import type { DBRepository, DBIssue, DBLabel, DBUser, DBType, Serialized } from './db'

// ============================================================================
// Dashboard List Item Types
// ============================================================================

// Repository info for dashboard items
export type DashboardRepository = Pick<DBRepository, 'id' | 'name' | 'fullName'>

// User info for dashboard items
export type DashboardUser = Pick<DBUser, 'id' | 'login' | 'avatarUrl'>

// Label info for dashboard items
export type DashboardLabel = Pick<Serialized<DBLabel>, 'id' | 'name' | 'color'>

// Type (issue type) info for dashboard items
export type DashboardType = Pick<Serialized<DBType>, 'id' | 'name' | 'color'>

// CI status for PRs
export interface DashboardCIStatus {
  id: number
  status: string | null
  conclusion: string | null
  htmlUrl: string | null
  name: string | null
}

// Issue/PR list item for dashboard sections (serialized for API responses)
export interface DashboardItem extends Pick<Serialized<DBIssue>, 'id' | 'pullRequest' | 'number' | 'title' | 'state' | 'stateReason' | 'draft' | 'merged' | 'htmlUrl' | 'createdAt' | 'updatedAt' | 'reactionCount' | 'commentCount'> {
  repository: DashboardRepository
  user?: DashboardUser | null
  labels: DashboardLabel[]
  type?: DashboardType | null
  ciStatus?: DashboardCIStatus | null
}
