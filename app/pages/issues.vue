<script setup lang="ts">
useSeoMeta({
  title: 'Issues'
})

const toast = useToast()
const nuxtApp = useNuxtApp()

const { data, status, refresh } = useLazyFetch<Issue[]>('/api/issues?pullRequest=false&state=open', {
  key: 'issues',
  default: () => nuxtApp.payload.data['issues'] as Issue[] ?? [],
  getCachedData: () => undefined
})

const {
  config,
  emptyText,
  items,
  filteredItems,
  q,
  searchInputRef,
  filters,
  toggleFilter,
  clearFilters,
  availableFilters,
  selectedItem,
  isPanelOpen,
  favoriteRepositories,
  favoriteRepositoriesOpen,
  hasFavorites,
  hasSynced,
  isMobile
} = useIssuesList({
  title: 'Issues',
  icon: 'i-lucide-circle-dot',
  emptyText: 'All triaged!',
  panelId: 'issues',
  items: data,
  status,
  refresh
})

// Bulk analysis
const analyzing = ref(false)
const analyzeProgress = ref({ analyzed: 0, total: 0 })

const unanalyzedItems = computed(() =>
  (filteredItems.value ?? []).filter(item => !item.resolutionStatus && !item.pullRequest)
)

const moreItems = computed(() => {
  const label = analyzing.value
    ? `Analyzing ${analyzeProgress.value.analyzed}/${analyzeProgress.value.total}...`
    : `Analyze ${unanalyzedItems.value.length} issue${unanalyzedItems.value.length !== 1 ? 's' : ''}`

  return [[
    {
      label,
      icon: 'i-lucide-sparkles',
      loading: analyzing.value,
      disabled: !unanalyzedItems.value.length || analyzing.value,
      onSelect: (e: MouseEvent) => {
        e.preventDefault()
        analyzeAll()
      }
    }
  ], [
    {
      label: `${favoriteRepositories.value.length} repos`,
      icon: 'i-lucide-book',
      onSelect: () => {
        setTimeout(() => {
          favoriteRepositoriesOpen.value = true
        }, 250)
      }
    }
  ]]
})

async function analyzeAll() {
  const issueIds = unanalyzedItems.value.map(item => item.id)
  if (!issueIds.length) return

  analyzing.value = true
  analyzeProgress.value = { analyzed: 0, total: issueIds.length }

  try {
    const response = await $fetch.raw('/api/issues/analyze', {
      method: 'POST',
      body: { issueIds },
      responseType: 'stream'
    })

    const reader = (response._data as unknown as ReadableStream).getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        try {
          const event = JSON.parse(line.slice(6))

          if (event.type === 'progress') {
            analyzeProgress.value = { analyzed: event.analyzed, total: event.total }
          }

          if (event.type === 'done') {
            toast.add({
              title: `Analyzed ${event.analyzed} issue${event.analyzed !== 1 ? 's' : ''}`,
              icon: 'i-lucide-sparkles'
            })
          }
        } catch { /* empty */ }
      }
    }

    await refresh()
  } catch (err: any) {
    toast.add({
      title: 'Analysis failed',
      description: err?.data?.message || err.message,
      color: 'error',
      icon: 'i-lucide-x'
    })
  } finally {
    analyzing.value = false
    analyzeProgress.value = { analyzed: 0, total: 0 }
  }
}
</script>

<template>
  <UDashboardPanel
    :id="`${config.panelId}-1`"
    :default-size="30"
    :min-size="25"
    :max-size="!selectedItem ? 100 : 50"
    resizable
    :class="[!selectedItem && 'lg:w-full']"
    :ui="{ body: 'overflow-hidden p-0!' }"
  >
    <template #header>
      <UDashboardNavbar :ui="{ left: 'shrink-0', right: 'shrink min-w-0' }">
        <template #title>
          <span class="text-highlighted font-semibold flex items-center gap-1.5">
            {{ config.title }}
            <UBadge
              :label="String(items?.length ?? 0)"
              variant="subtle"
              size="sm"
            />
          </span>
        </template>

        <template v-if="hasFavorites" #right>
          <Filters
            :filters="filters"
            :available-filters="availableFilters"
            :count="filteredItems?.length"
            @toggle="toggleFilter"
            @clear="clearFilters"
          />

          <UInput
            ref="searchInputRef"
            v-model="q"
            placeholder="Search..."
            variant="soft"
            icon="i-lucide-search"
            class="hidden sm:inline-flex"
          >
            <template #trailing>
              <UButton
                v-if="q"
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

          <UDropdownMenu
            :items="moreItems"
            :content="{ align: 'end' }"
          >
            <UButton
              icon="i-lucide-ellipsis"
              variant="soft"
              square
            />
          </UDropdownMenu>
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
          variant: 'soft',
          onClick: () => { favoriteRepositoriesOpen = true }
        }]"
      />

      <!-- Loading state (only on initial load, not refetches) -->
      <AppLoading v-else-if="status === 'pending' && !items?.length" />

      <!-- Empty state -->
      <UEmpty
        v-else-if="!filteredItems?.length"
        :icon="q ? 'i-lucide-search' : config.icon"
        :description="q ? 'No results found' : emptyText"
        class="flex-1"
      />

      <Issues
        v-else
        v-model="selectedItem"
        :issues="filteredItems"
        :active-filters="filters"
        class="flex-1"
        @filter="toggleFilter"
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

      &nbsp;
    </template>
  </UDashboardPanel>

  <UDashboardPanel v-if="selectedItem" :id="`${config.panelId}-2`">
    <Issue
      :item="selectedItem"
      @close="selectedItem = null"
      @refresh="refresh"
    />
  </UDashboardPanel>

  <ClientOnly>
    <USlideover
      v-if="isMobile"
      v-model:open="isPanelOpen"
      inset
    >
      <template #content="{ close }">
        <Issue
          v-if="selectedItem"
          :item="selectedItem"
          :on-close="close"
          @refresh="refresh"
        />
      </template>
    </USlideover>
  </ClientOnly>
</template>
