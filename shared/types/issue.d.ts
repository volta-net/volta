import type { DBUser, DBLabel, DBMilestone, DBIssueComment, DBIssue, IssueType } from './db'
import type { Repository } from './repository'

// User with selected fields for API responses
export type User = Pick<DBUser, 'id' | 'login' | 'name' | 'avatarUrl'>

// Label with selected fields for API responses
export type Label = Pick<DBLabel, 'id' | 'name' | 'color' | 'description'>

// Milestone with selected fields for API responses
export type Milestone = Pick<DBMilestone, 'id' | 'number' | 'title' | 'description' | 'state' | 'htmlUrl' | 'dueOn'>

// Comment with user relation
export interface Comment extends Pick<DBIssueComment, 'id' | 'body' | 'htmlUrl' | 'createdAt' | 'updatedAt'> {
  user: User | null
}

// Issue with all relations populated
export interface Issue extends Omit<DBIssue, 'repositoryId' | 'milestoneId' | 'userId' | 'closedById' | 'mergedById' | 'synced'> {
  type: IssueType
  repository: Repository | null
  milestone: Milestone | null
  user: User | null
  closedBy: User | null
  mergedBy: User | null
  assignees: User[]
  labels: Label[]
  requestedReviewers: User[]
  comments: Comment[]
}
