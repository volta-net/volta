import type { WorkflowConclusion } from '#shared/types/db'

type BadgeColor = 'success' | 'error' | 'neutral' | 'warning'

interface WorkflowStateConfig {
  icon: string
  color: string
  label: string
  badgeColor: BadgeColor
}

const workflowStates: Record<string, WorkflowStateConfig> = {
  success: {
    icon: 'i-octicon-check-circle-fill-24',
    color: 'text-emerald-500 dark:text-emerald-400',
    label: 'Success',
    badgeColor: 'success'
  },
  neutral: {
    icon: 'i-octicon-check-circle-fill-24',
    color: 'text-emerald-500 dark:text-emerald-400',
    label: 'Success',
    badgeColor: 'success'
  },
  failure: {
    icon: 'i-octicon-x-circle-fill-24',
    color: 'text-red-500 dark:text-red-400',
    label: 'Failed',
    badgeColor: 'error'
  },
  timed_out: {
    icon: 'i-octicon-x-circle-fill-24',
    color: 'text-red-500 dark:text-red-400',
    label: 'Timed out',
    badgeColor: 'error'
  },
  startup_failure: {
    icon: 'i-octicon-x-circle-fill-24',
    color: 'text-red-500 dark:text-red-400',
    label: 'Startup failure',
    badgeColor: 'error'
  },
  cancelled: {
    icon: 'i-octicon-stop-24',
    color: 'text-neutral-500 dark:text-neutral-400',
    label: 'Cancelled',
    badgeColor: 'neutral'
  },
  skipped: {
    icon: 'i-octicon-skip-24',
    color: 'text-neutral-500 dark:text-neutral-400',
    label: 'Skipped',
    badgeColor: 'neutral'
  },
  stale: {
    icon: 'i-octicon-skip-24',
    color: 'text-neutral-500 dark:text-neutral-400',
    label: 'Stale',
    badgeColor: 'neutral'
  },
  action_required: {
    icon: 'i-octicon-alert-24',
    color: 'text-yellow-500 dark:text-yellow-400',
    label: 'Action required',
    badgeColor: 'warning'
  }
}

const defaultState: WorkflowStateConfig = {
  icon: 'i-octicon-clock-24',
  color: 'text-yellow-500 dark:text-yellow-400',
  label: 'Running',
  badgeColor: 'warning'
}

// Get full state config
export function getWorkflowState(conclusion: WorkflowConclusion | null | undefined): WorkflowStateConfig {
  if (!conclusion) return defaultState
  return workflowStates[conclusion] || defaultState
}

// Individual getters for convenience
export const getWorkflowStateIcon = (conclusion: WorkflowConclusion | null | undefined) => getWorkflowState(conclusion).icon
export const getWorkflowStateColor = (conclusion: WorkflowConclusion | null | undefined) => getWorkflowState(conclusion).color
export const getWorkflowStateBadge = (conclusion: WorkflowConclusion | null | undefined) => {
  const state = getWorkflowState(conclusion)
  return { label: state.label, color: state.badgeColor }
}

// Composable for reactive use
export function useWorkflowState(conclusion: Ref<WorkflowConclusion | null | undefined>) {
  const state = computed(() => getWorkflowState(conclusion.value))

  return {
    state,
    icon: computed(() => state.value.icon),
    color: computed(() => state.value.color),
    label: computed(() => state.value.label),
    badgeColor: computed(() => state.value.badgeColor)
  }
}
