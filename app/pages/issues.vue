<script setup lang="ts">
import { breakpointsTailwind } from '@vueuse/core'
import { useFilter } from 'reka-ui'

useSeoMeta({
  title: 'Dashboard'
})

const route = useRoute()
const router = useRouter()

// Action-based tabs
const tabs = [
  {
    id: 'merge',
    label: 'Ready to Merge',
    icon: 'i-lucide-git-merge',
    api: '/api/issues?pullRequest=true&state=open&draft=false&isApproved=true&ciPassing=true',
    empty: 'No PRs ready to merge'
  },
  {
    id: 'review',
    label: 'Needs Review',
    icon: 'i-lucide-eye',
    api: '/api/issues?pullRequest=true&state=open&reviewRequested=me&draft=false&excludeBotWithPassingCi=true',
    empty: 'No reviews requested'
  },
  {
    id: 'triage',
    label: 'Needs Triage',
    icon: 'i-lucide-inbox',
    api: '/api/issues?pullRequest=false&state=open&excludeBots=true',
    empty: 'All triaged!'
  }
]

// Tab state from URL query
const activeTab = computed({
  get: () => (route.query.tab as string) || tabs[0]?.id,
  set: (tab) => {
    router.replace({ query: { ...route.query, tab } })
  }
})

// Current tab config
const currentTabConfig = computed(() =>
  tabs.find(t => t.id === activeTab.value) || tabs[0]
)

// Data for all tabs
const tabsData = ref<Record<string, Issue[]>>({})
const loading = ref(true)

// Current tab items
const items = computed(() => activeTab.value ? tabsData.value[activeTab.value] ?? [] : [])

// Tab counts
const tabCounts = computed(() => {
  const counts: Record<string, number> = {}
  for (const [key, data] of Object.entries(tabsData.value)) {
    counts[key] = data.length
  }
  return counts
})

async function fetchAllTabs() {
  loading.value = true
  const data: Record<string, Issue[]> = {}

  await Promise.all(
    tabs.map(async (tab) => {
      try {
        data[tab.id] = await $fetch<Issue[]>(tab.api) ?? []
      } catch {
        data[tab.id] = []
      }
    })
  )

  tabsData.value = data
  loading.value = false
}

// Fetch synced repositories to check if user has any
const { data: repositories } = await useFetch('/api/repositories/synced', {
  default: () => []
})

// Check if user has favorites
const { data: favorites, refresh: refreshFavorites } = await useFetch('/api/favorites/repositories', {
  default: () => []
})
const hasFavorites = computed(() => favorites.value && favorites.value.length > 0)

function refresh() {
  refreshFavorites()
  fetchAllTabs()
}

// Initial fetch
onMounted(() => {
  if (hasFavorites.value) {
    fetchAllTabs()
  }
})

// Refresh data when window gains focus
const focused = useWindowFocus()
watch(focused, (isFocused) => {
  if (isFocused && hasFavorites.value) {
    refresh()
  }
})

// Search
const q = ref('')
const { contains } = useFilter({ sensitivity: 'base' })

const filteredItems = computed(() => {
  if (!q.value) return items.value

  return items.value.filter((item) => {
    return (
      contains(item.title, q.value)
      || contains(String(item.number), q.value)
      || contains(item.repository.fullName, q.value)
      || contains(item.user?.login ?? '', q.value)
    )
  })
})

// Favorites slideover state
const favoritesOpen = ref(false)

// Selected issue state
const selectedItem = ref<Issue | null>(null)

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
    id="dashboard-1"
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
              :label="currentTabConfig?.label"
              color="neutral"
              variant="ghost"
              size="xl"
              square
              class="px-1.5 py-0.5 gap-1.5 data-[state=open]:bg-elevated text-highlighted font-semibold"
            >
              <template #trailing>
                <UBadge
                  :label="String(tabCounts[currentTabConfig?.id ?? ''] ?? 0)"
                  color="neutral"
                  variant="subtle"
                />
              </template>
            </UButton>

            <template #content>
              <div class="p-1 flex flex-col gap-0.5">
                <UButton
                  v-for="tab in tabs"
                  :key="tab.id"
                  :label="tab.label"
                  color="neutral"
                  variant="ghost"
                  :active="activeTab === tab.id"
                  active-variant="soft"
                  size="md"
                  class="py-1 gap-1.5"
                  square
                  @click="activeTab = tab.id"
                >
                  <template #trailing>
                    <UBadge
                      :label="String(tabCounts[tab.id])"
                      color="neutral"
                      variant="subtle"
                      class="ms-auto"
                    />
                  </template>
                </UButton>
              </div>
            </template>
          </UPopover>
        </template>

        <template v-if="hasFavorites" #trailing>
          <UInput
            v-model="q"
            placeholder="Search..."
            icon="i-lucide-search"
            color="neutral"
          />
        </template>

        <template v-if="hasFavorites" #right>
          <UButton
            color="neutral"
            variant="soft"
            icon="i-lucide-star"
            square
            :label="`${favorites.length} favorites`"
            @click="favoritesOpen = true"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <!-- No synced repositories -->
      <UEmpty
        v-if="!repositories?.length"
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
          onClick: () => { favoritesOpen = true }
        }]"
      />

      <!-- Loading state -->
      <div v-else-if="loading && !Object.keys(tabsData).length" class="flex-1 flex items-center justify-center">
        <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-muted" />
      </div>

      <!-- Empty state -->
      <UEmpty
        v-else-if="!filteredItems?.length"
        :icon="q ? 'i-lucide-search' : currentTabConfig?.icon"
        :description="q ? 'No results found' : currentTabConfig?.empty"
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

  <UDashboardPanel v-if="selectedItem" id="dashboard-2">
    <Issue
      :item="selectedItem"
      @close="selectedItem = null"
      @refresh="fetchAllTabs"
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
          @refresh="fetchAllTabs"
        />
      </template>
    </USlideover>
  </ClientOnly>

  <LazyRepositoriesFavorites
    v-model:open="favoritesOpen"
    :favorites="favorites"
    :repositories="repositories"
    @change="refresh"
  />
</template>
