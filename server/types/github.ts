// GitHub Webhook Payload Types
// Based on the fields we actually use in our webhook handlers

// ============================================================================
// User Types
// ============================================================================

export interface GitHubUser {
  id: number
  login: string
  avatar_url?: string
}

// ============================================================================
// Repository Types
// ============================================================================

export interface GitHubRepository {
  id: number
  name: string
  full_name: string
  private: boolean
  description?: string | null
  html_url?: string
  default_branch?: string
  archived?: boolean
  disabled?: boolean
}

// ============================================================================
// Issue Types
// ============================================================================

export interface GitHubIssueType {
  id: number
  name: string
  color?: string | null
  description?: string | null
}

export interface GitHubLabel {
  id: number
  name: string
  color: string
  description?: string | null
  default?: boolean
}

export interface GitHubMilestone {
  id: number
  number: number
  title: string
  description?: string | null
  state: string
  html_url: string
  open_issues: number
  closed_issues: number
  due_on?: string | null
  closed_at?: string | null
}

export interface GitHubIssue {
  id: number
  number: number
  title: string
  body?: string | null
  state: 'open' | 'closed'
  state_reason?: 'completed' | 'not_planned' | 'reopened' | null
  html_url: string
  locked: boolean
  user?: GitHubUser | null
  assignees?: GitHubUser[]
  labels?: GitHubLabel[]
  milestone?: GitHubMilestone | null
  type?: GitHubIssueType | null
  closed_at?: string | null
  closed_by?: GitHubUser | null
  created_at: string
  updated_at: string
  comments?: number
  reactions?: {
    total_count: number
  }
}

// ============================================================================
// Pull Request Types
// ============================================================================

export interface GitHubPullRequest {
  id: number
  number: number
  title: string
  body?: string | null
  state: 'open' | 'closed'
  html_url: string
  locked: boolean
  draft?: boolean
  merged?: boolean
  merged_at?: string | null
  merged_by?: GitHubUser | null
  user?: GitHubUser | null
  assignees?: GitHubUser[]
  requested_reviewers?: GitHubUser[]
  labels?: GitHubLabel[]
  milestone?: GitHubMilestone | null
  closed_at?: string | null
  closed_by?: GitHubUser | null
  created_at: string
  updated_at: string
  comments?: number
  commits?: number
  additions?: number
  deletions?: number
  changed_files?: number
  head?: {
    ref: string
    sha: string
  }
  base?: {
    ref: string
    sha: string
  }
  reactions?: {
    total_count: number
  }
}

// ============================================================================
// Comment Types
// ============================================================================

export interface GitHubComment {
  id: number
  body?: string | null
  html_url: string
  user?: GitHubUser | null
  created_at: string
  updated_at: string
}

// ============================================================================
// Review Types
// ============================================================================

export type GitHubReviewState = 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED' | 'PENDING'

export interface GitHubReview {
  id: number
  body?: string | null
  state: GitHubReviewState
  html_url: string
  commit_id: string
  submitted_at?: string | null
  user?: GitHubUser | null
}

export interface GitHubReviewComment {
  id: number
  body: string
  path?: string
  line?: number | null
  side?: string
  commit_id?: string
  diff_hunk?: string
  html_url: string
  pull_request_review_id?: number | null
  user?: GitHubUser | null
  created_at: string
  updated_at: string
}

// ============================================================================
// Release Types
// ============================================================================

export interface GitHubRelease {
  id: number
  tag_name: string
  name?: string | null
  body?: string | null
  draft: boolean
  prerelease: boolean
  html_url: string
  published_at?: string | null
  author?: GitHubUser | null
}

// ============================================================================
// Workflow Run Types
// ============================================================================

export type GitHubWorkflowConclusion = 'success' | 'failure' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required' | 'stale' | 'neutral' | 'startup_failure' | null

export interface GitHubWorkflowRun {
  id: number
  name?: string | null
  display_title?: string
  workflow_id: number
  workflow?: {
    name: string
  }
  head_branch?: string | null
  head_sha: string
  event: string
  status: string
  conclusion: GitHubWorkflowConclusion
  html_url: string
  run_number: number
  run_attempt?: number
  run_started_at?: string | null
  updated_at?: string | null
  actor?: GitHubUser | null
}

// ============================================================================
// Check Run Types (third-party integrations like Vercel, CircleCI)
// ============================================================================

export interface GitHubCheckRunApp {
  id: number
  slug: string
  name: string
}

export interface GitHubCheckRun {
  id: number
  head_sha: string
  name: string
  status: 'queued' | 'in_progress' | 'completed'
  conclusion: GitHubWorkflowConclusion
  html_url?: string | null
  details_url?: string | null
  started_at?: string | null
  completed_at?: string | null
  app?: GitHubCheckRunApp | null
}

// ============================================================================
// Installation Types
// ============================================================================

export interface GitHubInstallationAccount {
  id: number
  login: string
  type: 'User' | 'Organization'
  avatar_url?: string
}

export interface GitHubInstallation {
  id: number
  account: GitHubInstallationAccount
}

export interface GitHubInstallationRepository {
  id: number
  name: string
  full_name: string
  private: boolean
  description?: string | null
  html_url?: string
  default_branch?: string
}

// Combined type for upsert operations (includes fields from both Issue and PR)
export type GitHubIssueOrPR = GitHubIssue & Partial<Omit<GitHubPullRequest, keyof GitHubIssue>>
