import type { WorkflowConclusion } from '#shared/types/db'

type BadgeColor = 'success' | 'error' | 'neutral' | 'warning'

interface CIStateConfig {
  icon: string
  color: string
  label: string
  badgeColor: BadgeColor
}

const ciStates: Record<string, CIStateConfig> = {
  success: {
    icon: 'i-octicon-check-circle-16',
    color: 'text-success',
    label: 'Success',
    badgeColor: 'success'
  },
  neutral: {
    icon: 'i-octicon-check-circle-16',
    color: 'text-success',
    label: 'Success',
    badgeColor: 'success'
  },
  failure: {
    icon: 'i-octicon-x-circle-16',
    color: 'text-error',
    label: 'Failed',
    badgeColor: 'error'
  },
  timed_out: {
    icon: 'i-octicon-x-circle-16',
    color: 'text-error',
    label: 'Timed out',
    badgeColor: 'error'
  },
  startup_failure: {
    icon: 'i-octicon-x-circle-16',
    color: 'text-error',
    label: 'Startup failure',
    badgeColor: 'error'
  },
  cancelled: {
    icon: 'i-octicon-stop-16',
    color: 'text-muted',
    label: 'Cancelled',
    badgeColor: 'neutral'
  },
  skipped: {
    icon: 'i-octicon-skip-16',
    color: 'text-muted',
    label: 'Skipped',
    badgeColor: 'neutral'
  },
  stale: {
    icon: 'i-octicon-skip-16',
    color: 'text-muted',
    label: 'Stale',
    badgeColor: 'neutral'
  },
  action_required: {
    icon: 'i-octicon-alert-16',
    color: 'text-warning',
    label: 'Action required',
    badgeColor: 'warning'
  }
}

const defaultState: CIStateConfig = {
  icon: 'i-octicon-clock-16',
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
