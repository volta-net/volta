import type { Issue } from '#shared/types/issue'

// Partial issue type for notification context (subset of Issue fields)
type IssueStateLike = Pick<Issue, 'type' | 'state' | 'stateReason' | 'draft' | 'merged'>

// Pure utility functions that work with plain objects
export function getIssueStateIcon(issue: IssueStateLike | null | undefined, size: 16 | 24 = 16): string {
  if (!issue) return `i-octicon-issue-opened-${size}`

  if (issue.type === 'pull_request') {
    if (issue.draft) return `i-octicon-git-pull-request-draft-${size}`
    if (issue.merged) return `i-octicon-git-merge-${size}`
    if (issue.state === 'closed') return `i-octicon-git-pull-request-closed-${size}`
    return `i-octicon-git-pull-request-${size}`
  }

  if (issue.state === 'open') return `i-octicon-issue-opened-${size}`
  if (issue.stateReason === 'not_planned') return `i-octicon-skip-${size}`
  return `i-octicon-issue-closed-${size}`
}

export function getIssueStateColor(issue: IssueStateLike | null | undefined): string {
  if (!issue) return 'text-emerald-500'

  if (issue.type === 'pull_request') {
    if (issue.draft) return 'text-gray-400'
    if (issue.merged) return 'text-purple-500'
    if (issue.state === 'closed') return 'text-red-500'
    return 'text-emerald-500'
  }

  if (issue.state === 'open') return 'text-emerald-500'
  if (issue.stateReason === 'not_planned') return 'text-gray-400'
  return 'text-purple-500'
}

export function getIssueStateBadge(issue: IssueStateLike | null | undefined): { label: string, color: 'success' | 'error' | 'info' | 'neutral' } {
  if (!issue) return { label: 'Open', color: 'success' }

  if (issue.type === 'pull_request') {
    if (issue.draft) return { label: 'Draft', color: 'neutral' }
    if (issue.merged) return { label: 'Merged', color: 'info' }
    if (issue.state === 'closed') return { label: 'Closed', color: 'error' }
    return { label: 'Open', color: 'success' }
  }

  if (issue.state === 'open') return { label: 'Open', color: 'success' }
  if (issue.stateReason === 'not_planned') return { label: 'Not planned', color: 'neutral' }
  return { label: 'Closed', color: 'info' }
}

// Composable that wraps the utilities for reactive use
export function useIssueState(issue: Ref<IssueStateLike | null | undefined>) {
  return {
    getStateIcon: (size: 16 | 24 = 16) => getIssueStateIcon(issue.value, size),
    getStateColor: () => getIssueStateColor(issue.value),
    getStateBadge: () => getIssueStateBadge(issue.value)
  }
}
