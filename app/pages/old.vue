<script setup lang="ts">
import type { Issue } from '#shared/types/issue'

useSeoMeta({
  title: 'Dashboard'
})

const route = useRoute()
const router = useRouter()

const tabs = [
  { label: 'Issues', value: 'issues', icon: 'i-octicon-issue-opened-16' },
  { label: 'Pull Requests', value: 'pull-requests', icon: 'i-octicon-git-pull-request-16' }
]

// Tab state from URL query
const activeTab = computed({
  get: () => (route.query.tab as string) || tabs[0]?.value,
  set: (tab) => {
    router.replace({ query: { ...route.query, tab } })
  }
})

const issueSections = [
  { label: 'Created by Me', value: 'created-by-me', icon: 'i-lucide-user', api: '/api/dashboard/created-by-me?pullRequest=false', empty: 'No open issues' },
  { label: 'Assigned to Me', value: 'assigned-to-me', icon: 'i-lucide-user-check', api: '/api/dashboard/assigned-to-me?pullRequest=false', empty: 'No issues assigned to you' },
  { label: 'Hot Issues', value: 'hot-issues', icon: 'i-lucide-flame', api: '/api/dashboard/hot-issues', empty: 'No hot issues' },
  { label: 'Priority Bugs', value: 'priority-bugs', icon: 'i-lucide-bug', api: '/api/dashboard/priority-bugs', empty: 'No priority bugs' },
  { label: 'Needs Triage', value: 'needs-triage', icon: 'i-lucide-inbox', api: '/api/dashboard/needs-triage', empty: 'No issues need triage' }
]

const prSections = [
  { label: 'Created by Me', value: 'created-by-me', icon: 'i-lucide-user', api: '/api/dashboard/created-by-me?pullRequest=true', empty: 'No open PRs' },
  { label: 'Review Requested', value: 'review-requested', icon: 'i-lucide-eye', api: '/api/dashboard/review-requested', empty: 'No reviews requested' },
  { label: 'Waiting on Author', value: 'waiting-on-author', icon: 'i-lucide-clock', api: '/api/dashboard/waiting-on-author', empty: 'No PRs waiting on author' },
  { label: 'Ready to Merge', value: 'ready-to-merge', icon: 'i-lucide-git-merge', api: '/api/dashboard/ready-to-merge', empty: 'No PRs ready to merge' },
  { label: 'Dependency Updates', value: 'dependency-updates', icon: 'i-lucide-package', api: '/api/dashboard/dependency-updates', empty: 'No dependency updates' }
]

const currentSections = computed(() => activeTab.value === 'issues' ? issueSections : prSections)

// Active section (defaults to first section of current tab)
const activeSection = computed({
  get: () => (route.query.section as string) || currentSections.value[0]?.value,
  set: (section) => {
    router.replace({ query: { ...route.query, section } })
  }
})

// Current section config
const currentSectionConfig = computed(() =>
  currentSections.value.find(s => s.value === activeSection.value) || currentSections.value[0]
)

// All sections data (fetched in parallel)
const sectionsData = ref<Record<string, Issue[]>>({})
const loading = ref(false)

// Current section items (from cached data)
const items = computed(() => activeSection.value ? sectionsData.value[activeSection.value] ?? [] : [])
const status = computed(() => loading.value ? 'pending' : 'success')

// Section counts (computed from cached data)
const sectionCounts = computed(() => {
  const counts: Record<string, number> = {}
  for (const [key, data] of Object.entries(sectionsData.value)) {
    counts[key] = data.length
  }
  return counts
})

async function fetchAllSections(sections: typeof issueSections) {
  loading.value = true
  const data: Record<string, Issue[]> = {}

  await Promise.all(
    sections.map(async (section) => {
      try {
        data[section.value] = await $fetch<Issue[]>(section.api) ?? []
      } catch {
        data[section.value] = []
      }
    })
  )

  sectionsData.value = data
  loading.value = false
}

// Fetch all sections when tab changes or on mount
watch(() => activeTab.value, () => {
  activeSection.value = currentSections.value[0]?.value
  fetchAllSections(currentSections.value)
}, { immediate: true })

// Fetch synced repositories to check if user has any
const { data: repositories } = await useFetch('/api/repositories/synced', {
  default: () => []
})

// We also need to check if user has favorites
const { data: favorites, refresh: refreshFavorites } = await useFetch('/api/favorites/repositories', {
  default: () => []
})
const hasFavorites = computed(() => favorites.value && favorites.value.length > 0)

function refresh() {
  refreshFavorites()
  fetchAllSections(currentSections.value)
}

// Refresh data when window gains focus
const visibility = useDocumentVisibility()
watch(visibility, (isVisible) => {
  if (isVisible) {
    refresh()
  }
})

// Favorites slideover state
const favoritesOpen = ref(false)

function openFavorites() {
  favoritesOpen.value = true
}

function goToSettings() {
  navigateTo('/settings')
}
</script>

<template>
  <UDashboardPanel id="dashboard" :ui="{ body: 'overflow-hidden p-0!' }">
    <template #header>
      <UDashboardNavbar title="Dashboard" :ui="{ left: 'gap-3' }">
        <template v-if="hasFavorites" #trailing>
          <UFieldGroup>
            <UButton
              v-for="tab in tabs"
              :key="tab.value"
              :label="tab.label"
              color="neutral"
              variant="outline"
              active-variant="subtle"
              :active="activeTab === tab.value"
              :class="[activeTab === tab.value ? 'hover:bg-elevated' : '']"
              @click="activeTab = tab.value"
            />
          </UFieldGroup>
        </template>

        <template v-if="hasFavorites" #right>
          <UButton
            color="neutral"
            variant="soft"
            icon="i-lucide-star"
            :label="!hasFavorites ? 'Select favorites' : `${favorites.length} favorites`"
            @click="favoritesOpen = true"
          />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar v-if="hasFavorites">
        <UFieldGroup>
          <UButton
            v-for="section in currentSections"
            :key="section.value"
            :icon="section.icon"
            :label="section.label"
            color="neutral"
            variant="outline"
            active-variant="subtle"
            :active="activeSection === section.value"
            :class="[activeSection === section.value ? 'hover:bg-elevated' : '']"
            @click="activeSection = section.value"
          >
            <template #trailing>
              <UBadge
                v-if="(sectionCounts[section.value] ?? 0) > 0"
                :label="String(sectionCounts[section.value])"
                color="neutral"
                variant="subtle"
                size="xs"
                class="rounded-full! size-4.5 justify-center p-0 -my-1"
              />
            </template>
          </UButton>
        </UFieldGroup>
      </UDashboardToolbar>
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
          size: 'sm',
          onClick: goToSettings
        }]"
      />

      <!-- No favorites selected -->
      <UEmpty
        v-else-if="!hasFavorites"
        icon="i-lucide-star"
        title="Select your favorite repositories"
        description="Choose the repositories you want to focus on. Your dashboard will show PRs, issues, and activity from these repositories."
        variant="naked"
        size="lg"
        class="flex-1"
        :ui="{ header: 'max-w-md' }"
        :actions="[{
          label: 'Select favorites',
          icon: 'i-lucide-star',
          color: 'neutral',
          variant: 'soft',
          size: 'sm',
          onClick: openFavorites
        }]"
      />

      <!-- Loading state -->
      <div v-else-if="status === 'pending'" class="flex-1 flex items-center justify-center">
        <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-muted" />
      </div>

      <!-- Empty state -->
      <UEmpty
        v-else-if="!items?.length"
        :icon="currentSectionConfig?.icon"
        :title="currentSectionConfig?.empty"
        variant="naked"
        size="lg"
        class="flex-1"
      />

      <!-- Items list -->
      <div v-else class="flex-1 overflow-y-auto divide-y divide-default">
        <Issue
          v-for="item in items"
          :key="item.id"
          :item="item"
          show-author
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
