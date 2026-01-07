import type { DBUser, DBLabel, DBMilestone, DBIssueComment, DBIssue, DBRepository, DBType, Serialized } from './db'

// Re-export DB types for convenience
export type Label = DBLabel
export type Type = DBType

// CI status for PRs
export interface CIStatus {
  id: number
  status: string | null
  conclusion: string | null
  htmlUrl: string | null
  name: string | null
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
export interface Issue extends Serialized<DBIssue> {
  repository: Serialized<DBRepository>
  user?: Serialized<DBUser> | null
  labels?: Serialized<DBLabel>[]
  type?: Serialized<DBType> | null
  ciStatuses?: CIStatus[]
  linkedPrs?: LinkedPR[]
  linkedIssues?: LinkedIssue[]
  hasMaintainerComment?: boolean
}

// Full issue with all relations populated (for detail views)
export interface IssueDetail extends Serialized<DBIssue> {
  repository: Serialized<DBRepository>
  milestone: Serialized<DBMilestone> | null
  type: Serialized<DBType> | null
  user: Serialized<DBUser> | null
  closedBy: Serialized<DBUser> | null
  mergedBy: Serialized<DBUser> | null
  assignees: Serialized<DBUser>[]
  labels: Serialized<DBLabel>[]
  requestedReviewers: Serialized<DBUser>[]
  comments: Array<Serialized<DBIssueComment> & { user: Serialized<DBUser> | null }>
}
