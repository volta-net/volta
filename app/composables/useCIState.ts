type BadgeColor = 'success' | 'error' | 'neutral' | 'warning'

interface CIStateConfig {
  icon: string
  color: string
  label: string
  badgeColor: BadgeColor
}

const ciStates: Record<string, CIStateConfig> = {
  success: {
    icon: 'i-lucide-circle-check',
    color: 'text-success',
    label: 'Success',
    badgeColor: 'success'
  },
  neutral: {
    icon: 'i-lucide-circle-check',
    color: 'text-success',
    label: 'Success',
    badgeColor: 'success'
  },
  failure: {
    icon: 'i-lucide-circle-x',
    color: 'text-error',
    label: 'Failed',
    badgeColor: 'error'
  },
  timed_out: {
    icon: 'i-lucide-circle-x',
    color: 'text-error',
    label: 'Timed out',
    badgeColor: 'error'
  },
  startup_failure: {
    icon: 'i-lucide-circle-x',
    color: 'text-error',
    label: 'Startup failure',
    badgeColor: 'error'
  },
  cancelled: {
    icon: 'i-lucide-circle-stop',
    color: 'text-muted',
    label: 'Cancelled',
    badgeColor: 'neutral'
  },
  skipped: {
    icon: 'i-lucide-circle-slash',
    color: 'text-muted',
    label: 'Skipped',
    badgeColor: 'neutral'
  },
  stale: {
    icon: 'i-lucide-circle-slash',
    color: 'text-muted',
    label: 'Stale',
    badgeColor: 'neutral'
  },
  action_required: {
    icon: 'i-lucide-alert-circle',
    color: 'text-warning',
    label: 'Action required',
    badgeColor: 'warning'
  }
}

const defaultState: CIStateConfig = {
  icon: 'i-lucide-clock',
  color: 'text-warning',
  label: 'Running',
  badgeColor: 'warning'
}

// Get full state config
export function getCIState(conclusion: WorkflowConclusion | null | undefined): CIStateConfig {
  if (!conclusion) return defaultState
  return ciStates[conclusion] || defaultState
}

// Individual getters for convenience
export const getCIStateIcon = (conclusion: WorkflowConclusion | null | undefined) => getCIState(conclusion).icon
export const getCIStateColor = (conclusion: WorkflowConclusion | null | undefined) => getCIState(conclusion).color
export const getCIStateBadge = (conclusion: WorkflowConclusion | null | undefined) => {
  const state = getCIState(conclusion)
  return { label: state.label, color: state.badgeColor }
}

// Composable for reactive use
export function useCIState(conclusion: Ref<WorkflowConclusion | null | undefined>) {
  const state = computed(() => getCIState(conclusion.value))

  return {
    state,
    icon: computed(() => state.value.icon),
    color: computed(() => state.value.color),
    label: computed(() => state.value.label),
    badgeColor: computed(() => state.value.badgeColor)
  }
}

// Aggregate multiple CI statuses into a single status config
export interface AggregatedCIStatus {
  icon: string
  color: string
  label: string
  animate: boolean
  htmlUrl: string | null
}

export function getAggregatedCIStatus(statuses: CIStatus[] | undefined): AggregatedCIStatus | null {
  if (!statuses || statuses.length === 0) return null

  const total = statuses.length

  // Count by status
  let inProgress = 0
  let passed = 0
  let failed = 0
  let failedRun: CIStatus | null = null

  for (const ci of statuses) {
    if (ci.status === 'in_progress' || ci.status === 'queued') {
      inProgress++
    } else if (ci.conclusion === 'success' || ci.conclusion === 'skipped') {
      passed++
    } else {
      failed++
      if (!failedRun) failedRun = ci
    }
  }

  // Determine aggregate conclusion for styling
  let aggregateConclusion: WorkflowConclusion | null = null
  if (inProgress > 0) {
    aggregateConclusion = null // Running
  } else if (failed > 0) {
    aggregateConclusion = 'failure'
  } else {
    aggregateConclusion = 'success'
  }

  const state = getCIState(aggregateConclusion)

  // Build label: "2 / 3 passed" or "1 / 3 running"
  const label = inProgress > 0
    ? `${inProgress} / ${total} running`
    : `${passed} / ${total} passed`

  // Link to failed run if any, otherwise first run
  const representativeRun = failedRun || statuses[0]!

  return {
    icon: state.icon,
    color: state.color,
    label,
    animate: inProgress > 0,
    htmlUrl: representativeRun.htmlUrl
  }
}
