export type IssueStateLike = Pick<Issue, 'pullRequest' | 'state' | 'stateReason' | 'draft' | 'merged'>

type IssueColor = 'success' | 'error' | 'info' | 'neutral' | 'important'

interface IssueStateConfig {
  icon: string
  color: IssueColor
  label: string
}

// State configurations
const issueStates: Record<string, IssueStateConfig> = {
  // Pull Request states
  pr_draft: {
    icon: 'i-lucide-git-pull-request-draft',
    color: 'neutral',
    label: 'Draft'
  },
  pr_merged: {
    icon: 'i-lucide-git-merge',
    color: 'important',
    label: 'Merged'
  },
  pr_closed: {
    icon: 'i-lucide-git-pull-request-closed',
    color: 'error',
    label: 'Closed'
  },
  pr_open: {
    icon: 'i-lucide-git-pull-request',
    color: 'success',
    label: 'Open'
  },
  // Issue states
  issue_open: {
    icon: 'i-lucide-circle-dot',
    color: 'success',
    label: 'Open'
  },
  issue_not_planned: {
    icon: 'i-lucide-circle-slash',
    color: 'neutral',
    label: 'Not planned'
  },
  issue_closed: {
    icon: 'i-lucide-circle-check',
    color: 'important',
    label: 'Closed'
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
  return { label: state.label, color: state.color }
}

// Composable for reactive use
export function useIssueState(issue: Ref<IssueStateLike | null | undefined>) {
  const state = computed(() => getIssueState(issue.value))

  return {
    state,
    icon: computed(() => state.value.icon),
    color: computed(() => state.value.color),
    label: computed(() => state.value.label)
  }
}
