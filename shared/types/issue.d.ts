import type { DBUser, DBLabel, DBMilestone, DBIssueComment, DBIssue, Serialized } from './db'
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

// Full issue with all relations populated (for detail views)
export interface IssueDetail extends Omit<DBIssue, 'repositoryId' | 'milestoneId' | 'typeId' | 'userId' | 'closedById' | 'mergedById' | 'synced'> {
  pullRequest: boolean
  repository: Repository
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

// Linked PR/Issue reference (minimal info for display)
export interface LinkedPR {
  id: number
  number: number
  title: string
  state: string
  htmlUrl: string | null
}

export interface LinkedIssue {
  id: number
  number: number
  title: string
  state: string
  htmlUrl: string | null
}

// Issue/PR for list views (serialized for API responses)
export interface Issue extends Pick<Serialized<DBIssue>, 'id' | 'pullRequest' | 'number' | 'title' | 'state' | 'stateReason' | 'draft' | 'merged' | 'htmlUrl' | 'createdAt' | 'updatedAt' | 'reactionCount' | 'commentCount'> {
  repository: Repository
  user?: User | null
  labels: Label[]
  type?: Type | null
  ciStatuses?: CIStatus[]
  // Linked PRs (for issues) - PRs that will close this issue
  linkedPrs?: LinkedPR[]
  // Linked Issues (for PRs) - Issues this PR will close
  linkedIssues?: LinkedIssue[]
  // Whether a maintainer has commented on this issue
  hasMaintainerComment?: boolean
}
