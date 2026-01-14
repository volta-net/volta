<script setup lang="ts">
import { breakpointsTailwind } from '@vueuse/core'
import { useFilter } from 'reka-ui'

useSeoMeta({
  title: 'Issues'
})

const route = useRoute()
const router = useRouter()

const tabs = {
  merge: {
    label: 'Ready to Merge',
    icon: 'i-lucide-git-merge',
    api: '/api/issues?pullRequest=true&state=open&draft=false&isApproved=true&ciPassing=true',
    empty: 'No PRs ready to merge'
  },
  review: {
    label: 'Needs Review',
    icon: 'i-lucide-eye',
    api: '/api/issues?pullRequest=true&state=open&reviewRequested=me&draft=false&excludeBotWithPassingCi=true',
    empty: 'No reviews requested'
  },
  triage: {
    label: 'Needs Triage',
    icon: 'i-lucide-inbox',
    api: '/api/issues?pullRequest=false&state=open&excludeBots=true',
    empty: 'All triaged!'
  }
} as const

type TabId = keyof typeof tabs

// Active tab from URL
const activeTab = computed({
  get: () => (route.query.tab as TabId) || 'merge',
  set: (tab: TabId) => router.replace({ query: { ...route.query, tab } })
})

const currentTab = computed(() => tabs[activeTab.value])

// Fetch issues for active tab
const apiUrl = computed(() => currentTab.value.api)
const { data: items, status, refresh } = await useLazyFetch<Issue[]>(apiUrl, {
  default: () => [],
  watch: [apiUrl]
})

// Favorite repositories - use shared composable
const {
  favorites: favoriteRepositories,
  open: favoriteRepositoriesOpen,
  hasFavorites,
  hasSynced
} = useFavoriteRepositories()

// Favorite issues - use shared composable for cross-component communication
const { selectedIssue, clearSelection } = useFavoriteIssues()

// Selected issue state
const selectedItem = ref<Issue | null>(null)

// Watch for favorite issue selection from sidebar
watch(selectedIssue, (issue) => {
  if (issue) {
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

// Search
const q = ref('')
const searchInputRef = ref<{ inputRef: HTMLInputElement } | null>(null)
const { contains } = useFilter({ sensitivity: 'base' })

defineShortcuts({
  '/': () => searchInputRef.value?.inputRef?.focus()
})

const filteredItems = computed(() => {
  if (!q.value) return items.value ?? []

  return (items.value ?? []).filter((item) => {
    return (
      contains(item.title, q.value)
      || contains(String(item.number), q.value)
      || contains(item.repository.fullName, q.value)
      || contains(item.user?.login ?? '', q.value)
    )
  })
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
</script>

<template>
  <UDashboardPanel
    id="issues-1"
    :default-size="40"
    :min-size="25"
    :max-size="!selectedItem ? 100 : 50"
    :resizable="!!selectedItem"
    :class="[!selectedItem && 'lg:w-full']"
    :ui="{ body: 'overflow-hidden p-0!' }"
  >
    <template #header>
      <UDashboardNavbar :ui="{ title: 'shrink-0 -ml-1.5' }">
        <template #title>
          <UPopover
            mode="hover"
            :content="{ align: 'start', sideOffset: 4, alignOffset: -4 }"
            :ui="{ content: 'w-[calc(var(--reka-popper-anchor-width)+8px)]' }"
          >
            <UButton
              :label="currentTab.label"
              color="neutral"
              variant="ghost"
              size="xl"
              square
              class="px-1.5 py-0.5 gap-1.5 data-[state=open]:bg-elevated text-highlighted font-semibold"
            >
              <template #trailing>
                <UBadge
                  :label="String(items?.length ?? 0)"
                  color="neutral"
                  variant="subtle"
                />
              </template>
            </UButton>

            <template #content>
              <div class="p-1 flex flex-col gap-0.5">
                <UButton
                  v-for="(tab, id) in tabs"
                  :key="id"
                  :label="tab.label"
                  color="neutral"
                  variant="ghost"
                  :active="activeTab === id"
                  active-variant="soft"
                  size="md"
                  class="py-1 gap-1.5"
                  square
                  @click="activeTab = id"
                />
              </div>
            </template>
          </UPopover>
        </template>

        <template v-if="hasFavorites" #right>
          <UInput
            ref="searchInputRef"
            v-model="q"
            placeholder="Search..."
            variant="soft"
            icon="i-lucide-search"
            color="neutral"
          >
            <template #trailing>
              <UButton
                v-if="q"
                color="neutral"
                variant="link"
                icon="i-lucide-x"
                size="sm"
                aria-label="Clear search"
                class="-mr-2"
                @click="q = ''"
              />
              <UKbd
                v-else
                value="/"
                size="md"
                variant="soft"
                class="-mr-1"
              />
            </template>
          </UInput>

          <UButton
            color="neutral"
            variant="soft"
            icon="i-lucide-book"
            square
            :label="`${favoriteRepositories.length} repos`"
            @click="favoriteRepositoriesOpen = !favoriteRepositoriesOpen"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <!-- No synced repositories -->
      <UEmpty
        v-if="!hasSynced"
        icon="i-lucide-package"
        description="You have to install the GitHub App on your account or organization to get started."
        class="flex-1"
        :actions="[{
          label: 'Import repositories',
          to: '/settings',
          icon: 'i-lucide-download',
          color: 'neutral',
          variant: 'soft'
        }]"
      />

      <!-- No favorites selected -->
      <UEmpty
        v-else-if="!hasFavorites"
        icon="i-lucide-star"
        description="Select your favorite repositories"
        class="flex-1"
        :actions="[{
          label: 'Select favorites',
          icon: 'i-lucide-star',
          color: 'neutral',
          variant: 'soft',
          onClick: () => { favoriteRepositoriesOpen = true }
        }]"
      />

      <!-- Loading state (only on initial load, not refetches) -->
      <Loading v-else-if="status === 'pending' && !items?.length" />

      <!-- Empty state -->
      <UEmpty
        v-else-if="!filteredItems?.length"
        :icon="q ? 'i-lucide-search' : currentTab.icon"
        :description="q ? 'No results found' : currentTab.empty"
        class="flex-1"
      />

      <Issues
        v-else
        v-model="selectedItem"
        :issues="filteredItems"
        class="flex-1"
      />
    </template>

    <template #resize-handle="{ onMouseDown, onTouchStart, onDoubleClick }">
      <UDashboardResizeHandle
        v-if="!!selectedItem"
        class="after:absolute after:inset-y-0 after:right-0 after:w-px hover:after:bg-(--ui-border-accented) after:transition z-1"
        @mousedown="onMouseDown"
        @touchstart="onTouchStart"
        @dblclick="onDoubleClick"
      />
    </template>
  </UDashboardPanel>

  <UDashboardPanel v-if="selectedItem" id="issues-2">
    <Issue
      :item="selectedItem"
      @close="selectedItem = null"
      @refresh="refresh"
    />
  </UDashboardPanel>

  <ClientOnly>
    <USlideover
      v-if="isMobile && selectedItem"
      v-model:open="isPanelOpen"
    >
      <template #content>
        <Issue
          :item="selectedItem"
          @close="selectedItem = null"
          @refresh="refresh"
        />
      </template>
    </USlideover>
  </ClientOnly>
</template>
