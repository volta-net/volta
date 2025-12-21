import type { DBUser, DBLabel, DBMilestone, DBIssueComment, DBIssue, DBRepository, Serialized } from './db'
import type { Repository } from './repository'

// User with selected fields for API responses
export type User = Pick<DBUser, 'id' | 'login' | 'name' | 'avatarUrl'>

// Label with selected fields for API responses
export type Label = Pick<DBLabel, 'id' | 'name' | 'color' | 'description'>

// Milestone with selected fields for API responses
export type Milestone = Pick<DBMilestone, 'id' | 'number' | 'title' | 'description' | 'state' | 'htmlUrl' | 'dueOn'>

// Issue type with selected fields for API responses
export interface Type {
  id: number
  name: string
  color: string | null
}

// CI status for PRs
export interface CIStatus {
  id: number
  status: string | null
  conclusion: string | null
  htmlUrl: string | null
  name: string | null
}

// Comment with user relation
export interface Comment extends Pick<DBIssueComment, 'id' | 'body' | 'htmlUrl' | 'createdAt' | 'updatedAt'> {
  user: User | null
}

// Issue with all relations populated
export interface Issue extends Omit<DBIssue, 'repositoryId' | 'milestoneId' | 'typeId' | 'userId' | 'closedById' | 'mergedById' | 'synced'> {
  pullRequest: boolean
  repository: Repository | null
  milestone: Milestone | null
  type: Type | null
  user: User | null
  closedBy: User | null
  mergedBy: User | null
  assignees: User[]
  labels: Label[]
  requestedReviewers: User[]
  comments: Comment[]
}

// ============================================================================
// List Item Types (for dashboard, search results, etc.)
// ============================================================================

// Repository fields needed for list items (serialized)
type ListRepository = Pick<Serialized<DBRepository>, 'id' | 'name' | 'fullName' | 'private' | 'htmlUrl'>

// Issue/PR list item (serialized for API responses)
export interface IssueListItem extends Pick<Serialized<DBIssue>, 'id' | 'pullRequest' | 'number' | 'title' | 'state' | 'stateReason' | 'draft' | 'merged' | 'htmlUrl' | 'createdAt' | 'updatedAt' | 'reactionCount' | 'commentCount'> {
  repository: ListRepository
  user?: User | null
  labels: Label[]
  type?: Type | null
  ciStatuses?: CIStatus[]
  // AI analysis status (issues only)
  answered?: boolean
  analyzing?: boolean
}
