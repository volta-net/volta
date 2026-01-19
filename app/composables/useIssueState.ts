export type IssueStateLike = Pick<Issue, 'pullRequest' | 'state' | 'stateReason' | 'draft' | 'merged'>

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
    icon: 'i-lucide-git-pull-request-draft',
    color: 'text-muted',
    label: 'Draft',
    badgeColor: 'neutral'
  },
  pr_merged: {
    icon: 'i-lucide-git-merge',
    color: 'text-important',
    label: 'Merged',
    badgeColor: 'info'
  },
  pr_closed: {
    icon: 'i-lucide-git-pull-request-closed',
    color: 'text-error',
    label: 'Closed',
    badgeColor: 'error'
  },
  pr_open: {
    icon: 'i-lucide-git-pull-request',
    color: 'text-success',
    label: 'Open',
    badgeColor: 'success'
  },
  // Issue states
  issue_open: {
    icon: 'i-lucide-circle-dot',
    color: 'text-success',
    label: 'Open',
    badgeColor: 'success'
  },
  issue_not_planned: {
    icon: 'i-lucide-circle-slash',
    color: 'text-muted',
    label: 'Not planned',
    badgeColor: 'neutral'
  },
  issue_closed: {
    icon: 'i-lucide-circle-check',
    color: 'text-important',
    label: 'Closed',
    badgeColor: 'info'
  }
}

// Derive state key from issue properties
function getStateKey(issue: IssueStateLike | null | undefined): string {
  if (!issue) return 'issue_open'

  if (issue.pullRequest) {
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
export function getIssueState(issue: IssueStateLike | null | undefined): IssueStateConfig & { icon: string } {
  const key = getStateKey(issue)
  const state = issueStates[key]!
  return state
}

// Individual getters for convenience
export const getIssueStateIcon = (issue: IssueStateLike | null | undefined) => getIssueState(issue).icon
export const getIssueStateColor = (issue: IssueStateLike | null | undefined) => getIssueState(issue).color
export const getIssueStateBadge = (issue: IssueStateLike | null | undefined) => {
  const state = getIssueState(issue)
  return { label: state.label, color: state.badgeColor }
}

// Composable for reactive use
export function useIssueState(issue: Ref<IssueStateLike | null | undefined>) {
  const state = computed(() => getIssueState(issue.value))

  return {
    state,
    icon: computed(() => state.value.icon),
    color: computed(() => state.value.color),
    label: computed(() => state.value.label),
    badgeColor: computed(() => state.value.badgeColor),
    // Legacy methods for backward compatibility
    getStateIcon: () => getIssueStateIcon(issue.value),
    getStateColor: () => getIssueStateColor(issue.value),
    getStateBadge: () => getIssueStateBadge(issue.value)
  }
}
