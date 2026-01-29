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
// isPullRequest param allows overriding when notification type is known but issue.pullRequest might be undefined
export function getIssueStateKey(issue: IssueStateLike | null | undefined, isPullRequest?: boolean): string | null {
  if (!issue) return null

  const isPR = isPullRequest ?? issue.pullRequest

  if (isPR) {
    if (issue.draft) return 'pr_draft'
    if (issue.merged) return 'pr_merged'
    if (issue.state === 'closed') return 'pr_closed'
    return 'pr_open'
  }

  if (issue.state === 'open') return 'issue_open'
  if (issue.stateReason === 'not_planned') return 'issue_not_planned'
  return 'issue_closed'
}

// Get full state config with key
export function getIssueState(issue: IssueStateLike | null | undefined, isPullRequest?: boolean): (IssueStateConfig & { key: string }) | null {
  const key = getIssueStateKey(issue, isPullRequest)
  if (!key) return null
  return { ...issueStates[key]!, key }
}

// Individual getters for convenience
export const getIssueStateIcon = (issue: IssueStateLike | null | undefined) => getIssueState(issue)?.icon ?? 'i-lucide-circle-dot'
export const getIssueStateColor = (issue: IssueStateLike | null | undefined) => getIssueState(issue)?.color ?? 'neutral'
export const getIssueStateBadge = (issue: IssueStateLike | null | undefined) => {
  const state = getIssueState(issue)
  return state ? { label: state.label, color: state.color } : null
}

// Composable for reactive use
export function useIssueState(issue: Ref<IssueStateLike | null | undefined>) {
  const state = computed(() => getIssueState(issue.value))

  return {
    state,
    key: computed(() => state.value?.key ?? null),
    icon: computed(() => state.value?.icon ?? 'i-lucide-circle-dot'),
    color: computed(() => state.value?.color ?? 'neutral'),
    label: computed(() => state.value?.label ?? '')
  }
}
