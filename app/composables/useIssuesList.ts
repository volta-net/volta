import type { Ref } from 'vue'
import { useFilter } from '@nuxt/ui/composables'
import { breakpointsTailwind, useWindowFocus, useBreakpoints } from '@vueuse/core'
import type { Issue } from '#shared/types'
import { ref, computed, watch, useFavoriteRepositories, useFavoriteIssues, defineShortcuts, useFilters, applyFilters, matchIssueFilter, extractIssueFilters, pruneStaleFilters, useConfirmDialog } from '#imports'

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
  const { filter: filterItems } = useFilter()

  defineShortcuts({
    '/': () => searchInputRef.value?.inputRef?.focus()
  })

  // Filters
  const { filters, toggleFilter, removeFilter, clearFilters } = useFilters()
  const availableFilters = computed(() => extractIssueFilters(items.value ?? []))

  // Auto-remove filters that no longer match any item
  watch(items, (current) => {
    pruneStaleFilters(current ?? [], filters.value, matchIssueFilter, removeFilter)
  })

  const filteredItems = computed(() => {
    let result = items.value ?? []

    // Apply text search
    if (q.value) {
      result = filterItems(result, q.value, ['title', 'number', 'repository.fullName', 'user.login'])
    }

    // Apply filters
    if (filters.value.length) {
      result = applyFilters(result, filters.value, matchIssueFilter)
    }

    return result
  })

  // Open all filtered issues/PRs in browser
  const confirm = useConfirmDialog()

  async function openAll() {
    const issues = filteredItems.value
    if (!issues.length) return

    const singular = config.panelId === 'pulls' ? 'pull request' : 'issue'
    const label = issues.length === 1 ? singular : `${singular}s`
    const confirmed = await confirm({
      title: `Open ${issues.length === 1 ? '' : 'all '}${label} in browser?`,
      description: `This will open ${issues.length} ${label} in new ${issues.length === 1 ? 'tab' : 'tabs'}.`,
      icon: 'i-lucide-external-link',
      confirmLabel: 'Open all'
    })

    if (!confirmed) return

    for (const issue of issues) {
      if (issue.htmlUrl) {
        openInBrowser(issue.htmlUrl)
      }
    }
  }

  defineShortcuts({
    meta_shift_g: openAll
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
    // Actions
    openAll,
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
