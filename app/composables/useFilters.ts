import type { Notification, Issue } from '#shared/types'
import { ref, readonly } from '#imports'
import { getIssueStateKey } from './useIssueState'
import { getAggregatedCIStatus } from './useCIState'
import { useResolutionStatus } from './useResolutionStatus'

export type FilterType = 'actor' | 'action' | 'repository' | 'label' | 'resolution' | 'review' | 'ci' | 'state'

export interface ChipProp {
  color: string
}

export interface Filter {
  type: FilterType
  value: string
  label: string
  icon?: string
  avatar?: string | null
  chip?: ChipProp
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

// Get the aggregated CI category for an issue (stable values for filtering)
export function getIssueCICategory(issue: Issue): string | null {
  const status = getAggregatedCIStatus(issue.ciStatuses)
  if (!status) return null

  if (status.color === 'success') return 'Passed'
  if (status.color === 'error') return 'Failed'
  return 'Running'
}

// Get the review state label for a PR issue
export function getIssueReviewStateLabel(issue: Issue): string | null {
  return getIssueReviewState(issue)?.label ?? null
}

// Get the full review state (label + icon) for a PR issue
export function getIssueReviewState(issue: Issue): { label: string, icon: string } | null {
  if (!issue.pullRequest) return null

  const reviews = issue.reviews ?? []
  const hasRequestedReviewers = (issue.requestedReviewers?.length ?? 0) > 0

  if (reviews.some(r => r.state === 'CHANGES_REQUESTED')) return { label: 'Changes requested', icon: 'i-lucide-message-circle-warning' }
  if (reviews.some(r => r.state === 'APPROVED')) return { label: 'Approved', icon: 'i-lucide-message-circle-heart' }
  if (hasRequestedReviewers) return { label: 'Review required', icon: 'i-lucide-message-circle-dashed' }
  return null
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
    case 'review':
      return getIssueReviewStateLabel(issue) === filter.value
    case 'ci':
      return getIssueCICategory(issue) === filter.value
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

// Extract unique available filters from a list of issues
export function extractIssueFilters(items: Issue[]): Filter[] {
  const result: Filter[] = []
  const seen = new Set<string>()

  for (const item of items) {
    // Repository
    if (item.repository?.name) {
      const key = `repository:${item.repository.name}`
      if (!seen.has(key)) {
        seen.add(key)
        result.push({
          type: 'repository',
          value: item.repository.name,
          label: item.repository.name,
          avatar: `https://github.com/${item.repository.fullName.split('/')[0]}.png`
        })
      }
    }

    // Labels
    for (const label of item.labels ?? []) {
      const key = `label:${label.name}`
      if (!seen.has(key)) {
        seen.add(key)
        result.push({
          type: 'label',
          value: label.name,
          label: label.name,
          chip: { color: label.color }
        })
      }
    }

    // Actor
    if (item.user?.login) {
      const key = `actor:${item.user.login}`
      if (!seen.has(key)) {
        seen.add(key)
        result.push({
          type: 'actor',
          value: item.user.login,
          label: item.user.login,
          avatar: `https://github.com/${item.user.login}.png`
        })
      }
    }

    // CI Status
    const ciCategory = getIssueCICategory(item)
    const ciConfig = getAggregatedCIStatus(item.ciStatuses)
    if (ciCategory && ciConfig) {
      const key = `ci:${ciCategory}`
      if (!seen.has(key)) {
        seen.add(key)
        result.push({
          type: 'ci',
          value: ciCategory,
          label: ciCategory,
          icon: ciConfig.icon
        })
      }
    }

    // Review state (PRs only)
    const reviewState = getIssueReviewState(item)
    if (reviewState) {
      const key = `review:${reviewState.label}`
      if (!seen.has(key)) {
        seen.add(key)
        result.push({
          type: 'review',
          value: reviewState.label,
          label: reviewState.label,
          icon: reviewState.icon
        })
      }
    }

    // Resolution status
    if (item.resolutionStatus) {
      const key = `resolution:${item.resolutionStatus}`
      if (!seen.has(key)) {
        seen.add(key)
        const { getConfig } = useResolutionStatus()
        const resConfig = getConfig(item.resolutionStatus)
        result.push({
          type: 'resolution',
          value: item.resolutionStatus,
          label: resConfig?.label ?? item.resolutionStatus,
          icon: resConfig?.icon
        })
      }
    }
  }

  return result
}

// Extract unique available filters from a list of notifications
export function extractNotificationFilters(
  notifications: Notification[],
  helpers: {
    getActionLabel: (n: Notification) => string
    getActionIcon: (n: Notification) => string
  }
): Filter[] {
  const result: Filter[] = []
  const seen = new Set<string>()

  for (const n of notifications) {
    // Repository
    if (n.repository?.name) {
      const key = `repository:${n.repository.name}`
      if (!seen.has(key)) {
        seen.add(key)
        result.push({
          type: 'repository',
          value: n.repository.name,
          label: n.repository.name,
          avatar: `https://github.com/${n.repository.fullName.split('/')[0]}.png`
        })
      }
    }

    // Actor
    if (n.actor?.login) {
      const key = `actor:${n.actor.login}`
      if (!seen.has(key)) {
        seen.add(key)
        result.push({
          type: 'actor',
          value: n.actor.login,
          label: n.actor.login,
          avatar: n.actor.avatarUrl ?? null
        })
      }
    }

    // Action
    if (n.action) {
      const key = `action:${n.action}`
      if (!seen.has(key)) {
        seen.add(key)
        result.push({
          type: 'action',
          value: n.action,
          label: helpers.getActionLabel(n),
          icon: helpers.getActionIcon(n)
        })
      }
    }
  }

  return result
}
