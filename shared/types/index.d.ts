import type {
  DBFavoriteIssue,
  DBFavoriteRepository,
  DBInstallation,
  DBIssue,
  DBIssueComment,
  DBIssueReview,
  DBIssueReviewComment,
  DBLabel,
  DBMilestone,
  DBNotification,
  DBRelease,
  DBRepository,
  DBRepositorySubscription,
  DBType,
  DBUser,
  DBWorkflowRun,
  Serialized
} from './db'

export type { ResolutionStatus } from '@nuxthub/db/schema'

// Base serialized types
export type Label = Serialized<DBLabel>
export type Milestone = Serialized<DBMilestone>
export type Release = Serialized<DBRelease>
export type Repository = Serialized<DBRepository>
export type RepositorySubscription = Serialized<DBRepositorySubscription>
export type Type = Serialized<DBType>
export type User = Serialized<DBUser>
export type WorkflowRun = Serialized<DBWorkflowRun>

// CI Status
export interface CIStatus {
  id: number
  name: string | null
  status: string | null
  conclusion: string | null
  htmlUrl: string | null
}

// Linked references (minimal info for display)
export interface LinkedIssue {
  id: number
  number: number
  title: string
  state: string
  htmlUrl: string | null
}

export interface LinkedPR {
  id: number
  number: number
  title: string
  state: string
  htmlUrl: string | null
}

// Issue for list views
export interface Issue extends Serialized<DBIssue> {
  repository: Repository
  user?: User | null
  labels?: Label[]
  type?: Type | null
  ciStatuses?: CIStatus[]
  linkedIssues?: LinkedIssue[]
  linkedPrs?: LinkedPR[]
  hasMaintainerComment?: boolean
  // AI Resolution Analysis (issues only)
  resolutionAnsweredBy?: User | null
}

// Review with user relation
export type IssueReview = Serialized<DBIssueReview> & { user: User | null }

// Review comment with user and review relations
export type IssueReviewComment = Serialized<DBIssueReviewComment> & {
  user: User | null
  review: IssueReview | null
}

// Issue for detail views (all relations populated)
export interface IssueDetail extends Serialized<DBIssue> {
  repository: Repository
  user: User | null
  closedBy: User | null
  mergedBy: User | null
  assignees: User[]
  requestedReviewers: User[]
  labels: Label[]
  milestone: Milestone | null
  type: Type | null
  comments: Array<Serialized<DBIssueComment> & { user: User | null }>
  reviews?: IssueReview[]
  reviewComments?: IssueReviewComment[]
  ciStatuses?: CIStatus[]
  linkedIssues?: LinkedIssue[]
  linkedPrs?: LinkedPR[]
  // AI Resolution Analysis (issues only)
  resolutionAnsweredBy?: User | null
  resolutionAnswerCommentId?: number | null
}

// Notification with relations
export interface Notification extends Serialized<DBNotification> {
  repository: Repository | null
  issue: Issue | null
  release: Release | null
  workflowRun: WorkflowRun | null
  actor: User | null
}

// Favorites
export interface FavoriteIssue extends Pick<Serialized<DBFavoriteIssue>, 'id' | 'issueId' | 'createdAt'> {
  issue: Pick<DBIssue, 'id'>
}

export interface FavoriteRepository extends Pick<Serialized<DBFavoriteRepository>, 'id' | 'repositoryId' | 'createdAt'> {
  repository: Pick<DBRepository, 'id' | 'fullName' | 'private'>
}

// Installations
export interface InstallationRepository extends Repository {
  subscription?: RepositorySubscription
  synced?: boolean
  stars?: number
}

export interface Installation extends Pick<DBInstallation, 'id'> {
  account: {
    login: string | undefined
    avatar: string | undefined
    type: string | undefined
  }
  repositories: InstallationRepository[]
}
