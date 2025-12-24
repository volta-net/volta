<script setup lang="ts">
import type { Issue } from '#shared/types/issue'
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
const visibility = useDocumentVisibility()
watch(visibility, (isVisible) => {
  if (isVisible && hasFavorites.value) {
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
</script>

<template>
  <UDashboardPanel id="dashboard" :ui="{ body: 'overflow-hidden p-0!' }">
    <template #header>
      <UDashboardNavbar title="Dashboard" :ui="{ left: 'gap-3' }">
        <template v-if="hasFavorites" #trailing>
          <UFieldGroup>
            <UButton
              v-for="tab in tabs"
              :key="tab.id"
              :icon="tab.icon"
              :label="tab.label"
              color="neutral"
              variant="outline"
              active-variant="subtle"
              :active="activeTab === tab.id"
              :class="[activeTab === tab.id ? 'hover:bg-elevated' : '']"
              @click="activeTab = tab.id"
            >
              <template #trailing>
                <UBadge
                  v-if="(tabCounts[tab.id] ?? 0) > 0"
                  :label="String(tabCounts[tab.id])"
                  color="neutral"
                  variant="subtle"
                  size="xs"
                  class="rounded-full! size-4.5 justify-center p-0 -my-1"
                />
              </template>
            </UButton>
          </UFieldGroup>

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
            variant="ghost"
            icon="i-lucide-refresh-cw"
            :loading="loading"
            @click="refresh"
          />
          <UButton
            color="neutral"
            variant="soft"
            icon="i-lucide-star"
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
        title="No synced repositories"
        description="You have to install the GitHub App on your account or organization to get started."
        variant="naked"
        size="lg"
        class="flex-1"
        :actions="[{
          label: 'Import repositories',
          to: '/settings',
          icon: 'i-lucide-download',
          color: 'neutral',
          variant: 'soft',
          size: 'sm'
        }]"
      />

      <!-- No favorites selected -->
      <UEmpty
        v-else-if="!hasFavorites"
        icon="i-lucide-star"
        title="Select your favorite repositories"
        description="Choose the repositories you want to focus on."
        variant="naked"
        size="lg"
        class="flex-1"
        :actions="[{
          label: 'Select favorites',
          icon: 'i-lucide-star',
          color: 'neutral',
          variant: 'soft',
          size: 'sm',
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
        :title="q ? 'No results found' : currentTabConfig?.empty"
        variant="naked"
        size="lg"
        class="flex-1"
      />

      <!-- Items list -->
      <div v-else class="flex-1 overflow-y-auto divide-y divide-default">
        <Issue
          v-for="item in filteredItems"
          :key="item.id"
          :item="item"
        />
      </div>
    </template>
  </UDashboardPanel>

  <LazyDashboardFavorites
    v-model:open="favoritesOpen"
    :favorites="favorites"
    :repositories="repositories"
    @change="refresh"
  />
</template>
