import type { Issue } from '#shared/types/issue'

// Partial issue type for notification context (subset of Issue fields)
export type IssueStateLike = Pick<Issue, 'type' | 'state' | 'stateReason' | 'draft' | 'merged'>

type BadgeColor = 'success' | 'error' | 'info' | 'neutral'

interface IssueStateConfig {
  icon: string
  color: string
  label: string
  badgeColor: BadgeColor
}

// State configurations (icon uses {size} placeholder)
const issueStates: Record<string, IssueStateConfig> = {
  // Pull Request states
  pr_draft: {
    icon: 'i-octicon-git-pull-request-draft-{size}',
    color: 'text-neutral-500 dark:text-neutral-400',
    label: 'Draft',
    badgeColor: 'neutral'
  },
  pr_merged: {
    icon: 'i-octicon-git-merge-{size}',
    color: 'text-purple-500 dark:text-purple-400',
    label: 'Merged',
    badgeColor: 'info'
  },
  pr_closed: {
    icon: 'i-octicon-git-pull-request-closed-{size}',
    color: 'text-red-500 dark:text-red-400',
    label: 'Closed',
    badgeColor: 'error'
  },
  pr_open: {
    icon: 'i-octicon-git-pull-request-{size}',
    color: 'text-emerald-500 dark:text-emerald-400',
    label: 'Open',
    badgeColor: 'success'
  },
  // Issue states
  issue_open: {
    icon: 'i-octicon-issue-opened-{size}',
    color: 'text-emerald-500 dark:text-emerald-400',
    label: 'Open',
    badgeColor: 'success'
  },
  issue_not_planned: {
    icon: 'i-octicon-skip-{size}',
    color: 'text-neutral-500 dark:text-neutral-400',
    label: 'Not planned',
    badgeColor: 'neutral'
  },
  issue_closed: {
    icon: 'i-octicon-issue-closed-{size}',
    color: 'text-purple-500 dark:text-purple-400',
    label: 'Closed',
    badgeColor: 'info'
  }
}

// Derive state key from issue properties
function getStateKey(issue: IssueStateLike | null | undefined): string {
  if (!issue) return 'issue_open'

  if (issue.type === 'pull_request') {
    if (issue.draft) return 'pr_draft'
    if (issue.merged) return 'pr_merged'
    if (issue.state === 'closed') return 'pr_closed'
    return 'pr_open'
  }

  if (issue.state === 'open') return 'issue_open'
  if (issue.stateReason === 'not_planned') return 'issue_not_planned'
  return 'issue_closed'
}

// Get full state config
export function getIssueState(issue: IssueStateLike | null | undefined, size: 16 | 24 = 24): IssueStateConfig & { icon: string } {
  const key = getStateKey(issue)
  const state = issueStates[key]!
  return {
    ...state,
    icon: state.icon.replace('{size}', String(size))
  }
}

// Individual getters for convenience
export const getIssueStateIcon = (issue: IssueStateLike | null | undefined, size: 16 | 24 = 24) => getIssueState(issue, size).icon
export const getIssueStateColor = (issue: IssueStateLike | null | undefined) => getIssueState(issue).color
export const getIssueStateBadge = (issue: IssueStateLike | null | undefined) => {
  const state = getIssueState(issue)
  return { label: state.label, color: state.badgeColor }
}

// Composable for reactive use
export function useIssueState(issue: Ref<IssueStateLike | null | undefined>, size: 16 | 24 = 24) {
  const state = computed(() => getIssueState(issue.value, size))

  return {
    state,
    icon: computed(() => state.value.icon),
    color: computed(() => state.value.color),
    label: computed(() => state.value.label),
    badgeColor: computed(() => state.value.badgeColor),
    // Legacy methods for backward compatibility
    getStateIcon: (s: 16 | 24 = size) => getIssueStateIcon(issue.value, s),
    getStateColor: () => getIssueStateColor(issue.value),
    getStateBadge: () => getIssueStateBadge(issue.value)
  }
}
