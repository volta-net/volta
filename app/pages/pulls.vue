<script setup lang="ts">
useSeoMeta({
  title: 'Pull Requests'
})

const {
  config,
  emptyText,
  items,
  filteredItems,
  status,
  refresh,
  q,
  searchInputRef,
  selectedItem,
  isPanelOpen,
  favoriteRepositories,
  favoriteRepositoriesOpen,
  hasFavorites,
  hasSynced,
  isMobile
} = await useIssuesList({
  title: 'Pull Requests',
  icon: 'i-lucide-git-pull-request',
  api: '/api/issues?pullRequest=true&state=open',
  emptyText: 'No open pull requests',
  panelId: 'pulls'
})
</script>

<template>
  <UDashboardPanel
    id="pulls-1"
    :default-size="30"
    :min-size="25"
    :max-size="!selectedItem ? 100 : 50"
    :resizable="!!selectedItem"
    :class="[!selectedItem && 'lg:w-full']"
    :ui="{ body: 'overflow-hidden p-0!' }"
  >
    <template #header>
      <UDashboardNavbar>
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

          <UButton
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

  <UDashboardPanel v-if="selectedItem" id="pulls-2">
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
