import { breakpointsTailwind, useWindowFocus, useBreakpoints } from '@vueuse/core'
import { useFilter } from 'reka-ui'
import type { Ref } from 'vue'
import type { Issue } from '#shared/types'
import { ref, computed, watch, useFavoriteRepositories, useFavoriteIssues, defineShortcuts, useFilters, applyFilters, matchIssueFilter, extractIssueFilters } from '#imports'

export interface IssuesListConfig {
  title: string
  icon: string
  emptyText: string
  panelId: string
  items: Ref<Issue[]>
  status: Ref<string>
  refresh: () => Promise<void>
}

export function useIssuesList(config: IssuesListConfig) {
  const { status, refresh } = config

  const items = config.items

  // Favorite repositories - use shared composable
  const {
    favorites: favoriteRepositories,
    open: favoriteRepositoriesOpen,
    hasFavorites,
    hasSynced
  } = useFavoriteRepositories()

  // Favorite issues - use shared composable for cross-component communication
  const { selectedIssue, clearSelection } = useFavoriteIssues()

  // Selected issue state - useState so it persists across navigations
  const selectedItem = useState<Issue | null>(`${config.panelId}-selected`, () => null)

  // Watch for issue selection from sidebar favorites or linked items
  const isPullsPanel = config.panelId === 'pulls'
  watch(selectedIssue, (issue) => {
    if (issue && issue.pullRequest === isPullsPanel) {
      selectedItem.value = {
        ...issue,
        repositoryId: issue.repository.id,
        createdAt: '',
        updatedAt: ''
      } as Issue
      clearSelection()
    }
  }, { immediate: true })

  // Refresh data when window gains focus
  const focused = useWindowFocus()
  watch(focused, (isFocused) => {
    if (isFocused && hasFavorites.value) {
      refresh()
    }
  })

  // Refresh data when favorite repositories slideover closes
  watch(favoriteRepositoriesOpen, (isOpen, wasOpen) => {
    if (!isOpen && wasOpen) {
      refresh()
    }
  })

  // Search
  const q = ref('')
  const searchInputRef = ref<{ inputRef: HTMLInputElement } | null>(null)
  const { contains } = useFilter({ sensitivity: 'base' })

  defineShortcuts({
    '/': () => searchInputRef.value?.inputRef?.focus()
  })

  // Filters
  const { filters, toggleFilter, clearFilters } = useFilters()
  const availableFilters = computed(() => extractIssueFilters(items.value ?? []))

  const filteredItems = computed(() => {
    let result = items.value ?? []

    // Apply text search
    if (q.value) {
      result = result.filter((item) => {
        return (
          contains(item.title, q.value)
          || contains(String(item.number), q.value)
          || contains(item.repository.fullName, q.value)
          || contains(item.user?.login ?? '', q.value)
        )
      })
    }

    // Apply filters
    if (filters.value.length) {
      result = applyFilters(result, filters.value, matchIssueFilter)
    }

    return result
  })

  const isPanelOpen = computed({
    get() {
      return !!selectedItem.value
    },
    set(value: boolean) {
      if (!value) {
        selectedItem.value = null
      }
    }
  })

  const breakpoints = useBreakpoints(breakpointsTailwind)
  const isMobile = breakpoints.smaller('lg')

  return {
    // Config
    config,
    emptyText: config.emptyText,
    // Data
    items,
    filteredItems,
    status,
    refresh,
    // Search
    q,
    searchInputRef,
    // Filters
    filters,
    toggleFilter,
    clearFilters,
    availableFilters,
    // Selection
    selectedItem,
    isPanelOpen,
    // Favorites
    favoriteRepositories,
    favoriteRepositoriesOpen,
    hasFavorites,
    hasSynced,
    // Responsive
    isMobile
  }
}
