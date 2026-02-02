import type { Notification, Issue } from '#shared/types'
import { ref, readonly } from '#imports'
import { getIssueStateKey } from './useIssueState'

export type FilterType = 'actor' | 'action' | 'repository' | 'label' | 'resolution' | 'state'

export interface Filter {
  type: FilterType
  value: string
  label: string
  icon?: string
  avatar?: string | null
  color?: string // For label filters
}

export function useFilters() {
  const filters = ref<Filter[]>([])

  function addFilter(filter: Filter) {
    if (hasFilter(filter.type, filter.value)) return
    filters.value = [...filters.value, filter]
  }

  function removeFilter(type: FilterType, value: string) {
    filters.value = filters.value.filter(f => !(f.type === type && f.value === value))
  }

  function toggleFilter(filter: Filter) {
    if (hasFilter(filter.type, filter.value)) {
      removeFilter(filter.type, filter.value)
    } else {
      addFilter(filter)
    }
  }

  function clearFilters() {
    filters.value = []
  }

  function hasFilter(type: FilterType, value: string): boolean {
    return filters.value.some(f => f.type === type && f.value === value)
  }

  return {
    filters: readonly(filters),
    addFilter,
    removeFilter,
    toggleFilter,
    clearFilters,
    hasFilter
  }
}

// Filter matcher for notifications
export function matchNotificationFilter(notification: Notification, filter: Filter): boolean {
  switch (filter.type) {
    case 'actor':
      return notification.actor?.login === filter.value
    case 'action':
      return notification.action === filter.value
    case 'repository':
      return notification.repository?.name === filter.value || notification.repository?.fullName === filter.value
    case 'state': {
      // Only issue/PR notifications can match state filters
      if (notification.type !== 'issue' && notification.type !== 'pull_request') return false
      const stateKey = getIssueStateKey(notification.issue, notification.type === 'pull_request')
      if (!stateKey) return false
      return stateKey === filter.value
    }
    default:
      return true
  }
}

// Filter matcher for issues
export function matchIssueFilter(issue: Issue, filter: Filter): boolean {
  switch (filter.type) {
    case 'actor':
      return issue.user?.login === filter.value
    case 'repository':
      return issue.repository?.name === filter.value || issue.repository?.fullName === filter.value
    case 'label':
      return issue.labels?.some(l => l.name === filter.value) ?? false
    case 'resolution':
      return issue.resolutionStatus === filter.value
    default:
      return true
  }
}

// Apply filters to a list of items
export function applyFilters<T>(
  items: T[],
  filters: readonly Filter[],
  matcher: (item: T, filter: Filter) => boolean
): T[] {
  if (!filters.length) return items
  return items.filter(item =>
    filters.every(filter => matcher(item, filter))
  )
}
