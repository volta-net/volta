import type { IssueType } from '../../server/db/schema'
import type { Repository } from './repository'

export interface User {
  id: number
  login: string
  name: string | null
  avatarUrl: string | null
}

export interface Label {
  id: number
  name: string
  color: string
  description: string | null
}

export interface Milestone {
  id: number
  number: number
  title: string
  description: string | null
  state: string
  htmlUrl: string | null
  dueOn: Date | null
}

export interface Comment {
  id: number
  body: string
  htmlUrl: string | null
  createdAt: Date
  updatedAt: Date
  user: User | null
}

export interface Issue {
  id: number
  type: IssueType
  number: number
  title: string
  body: string | null
  state: string
  stateReason: string | null
  htmlUrl: string | null
  locked: boolean | null
  // PR-specific
  draft: boolean | null
  merged: boolean | null
  commits: number | null
  additions: number | null
  deletions: number | null
  changedFiles: number | null
  headRef: string | null
  headSha: string | null
  baseRef: string | null
  baseSha: string | null
  mergedAt: Date | null
  // Timestamps
  closedAt: Date | null
  createdAt: Date
  updatedAt: Date
  // Relations
  repository: Repository | null
  milestone: Milestone | null
  user: User | null
  assignees: User[]
  labels: Label[]
  requestedReviewers: User[]
  comments: Comment[]
}
