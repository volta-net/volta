<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'
import { refDebounced } from '@vueuse/core'

useSeoMeta({
  titleTemplate: '%s - Volta'
})

const router = useRouter()

// Favorite issues
const {
  favorites: favoriteIssues,
  open: favoriteIssuesOpen,
  refresh: refreshFavoriteIssues,
  selectIssue
} = useFavoriteIssues()

function handleSelectFavoriteIssue(issue: Parameters<typeof selectIssue>[0]) {
  selectIssue(issue)
  router.push(issue.pullRequest ? '/pulls' : '/issues')
}

// Favorite repositories
const {
  favorites: favoriteRepositories,
  synced: syncedRepositories,
  open: favoriteRepositoriesOpen,
  refresh: refreshFavoriteRepositories
} = useFavoriteRepositories()

const searchOpen = ref(false)
// Issue search for command palette
const searchTerm = ref('')
const searchTermDebounced = refDebounced(searchTerm, 300)

const { data: searchedIssues, status: searchStatus } = useLazyFetch('/api/issues/search', {
  query: { q: searchTermDebounced },
  default: () => [],
  immediate: false
})

const searchedIssueItems = computed(() => {
  if (!searchedIssues.value) return []
  return searchedIssues.value.map(issue => ({
    id: issue.id,
    label: issue.title,
    prefix: `${issue.repository.fullName}#${issue.number}`,
    icon: issue.pullRequest ? 'i-lucide-git-pull-request' : 'i-lucide-circle-dot',
    onSelect: () => {
      selectIssue({
        id: issue.id,
        number: issue.number,
        title: issue.title,
        state: issue.state,
        stateReason: null,
        pullRequest: issue.pullRequest,
        draft: null,
        merged: null,
        htmlUrl: issue.htmlUrl,
        repository: {
          id: issue.repository.id,
          name: issue.repository.fullName.split('/')[1]!,
          fullName: issue.repository.fullName
        }
      })
      router.push(issue.pullRequest ? '/pulls' : '/issues')
    }
  }))
})

const links = computed<NavigationMenuItem[][]>(() => [[{
  label: 'Inbox',
  icon: 'i-lucide-inbox',
  to: '/inbox'
}, {
  label: 'Issues',
  icon: 'i-lucide-circle-dot',
  to: '/issues'
}, {
  label: 'Pull Requests',
  icon: 'i-lucide-git-pull-request',
  to: '/pulls'
}, {
  label: 'Settings',
  icon: 'i-lucide-settings',
  to: '/settings'
}], [{
  label: 'Search',
  icon: 'i-lucide-search',
  onSelect: () => { searchOpen.value = true }
}, {
  label: 'Favorites',
  icon: 'i-lucide-star',
  onSelect: () => { favoriteIssuesOpen.value = !favoriteIssuesOpen.value }
}]])

const groups = computed(() => [{
  id: 'links',
  items: [{
    label: 'Inbox',
    icon: 'i-lucide-inbox',
    to: '/inbox'
  }, {
    label: 'Issues',
    icon: 'i-lucide-circle-dot',
    to: '/issues'
  }, {
    label: 'Pull Requests',
    icon: 'i-lucide-git-pull-request',
    to: '/pulls'
  }, {
    label: 'Settings',
    icon: 'i-lucide-settings',
    to: '/settings'
  }]
}, {
  id: 'favorites',
  label: 'Favorites',
  items: [{
    label: 'Issues & Pull Requests',
    icon: 'i-lucide-circle-dot',
    onSelect: () => {
      setTimeout(() => {
        favoriteIssuesOpen.value = true
      }, 250)
    }
  }, {
    label: 'Repositories',
    icon: 'i-lucide-book',
    onSelect: () => {
      setTimeout(() => {
        favoriteRepositoriesOpen.value = true
      }, 250)
    }
  }]
}, {
  id: 'search-issues',
  label: searchTerm.value ? `Issues matching "${searchTerm.value}"...` : 'Search Issues',
  items: searchedIssueItems.value,
  ignoreFilter: true
}])
</script>

<template>
  <UDashboardGroup unit="rem">
    <UDashboardSidebar
      id="default"
      collapsed
      class="border-r-0 py-4"
      :menu="{ inset: true, overlay: false }"
    >
      <template #header>
        <NuxtLink to="/" class="mx-auto">
          <AppIcon class="size-6" />
        </NuxtLink>
      </template>

      <template #default="{ collapsed }">
        <UNavigationMenu
          :collapsed="collapsed"
          :items="links[0]"
          orientation="vertical"
          tooltip
          popover
        />

        <UNavigationMenu
          :collapsed="collapsed"
          :items="links[1]"
          orientation="vertical"
          tooltip
          popover
          class="mt-auto"
        />
      </template>

      <template #footer="{ collapsed }">
        <UserMenu :collapsed="collapsed" />
      </template>
    </UDashboardSidebar>

    <div class="flex-1 flex m-4 lg:ml-0 rounded-lg ring ring-default bg-default/75 shadow min-w-0">
      <slot />
    </div>

    <UDashboardSearch
      v-model:open="searchOpen"
      v-model:search-term="searchTerm"
      :loading="searchStatus === 'pending'"
      :groups="groups"
      :ui="{ input: '[&>input]:h-12' }"
    />

    <LazyIssuesFavorites
      v-model:open="favoriteIssuesOpen"
      :favorites="favoriteIssues"
      @select="handleSelectFavoriteIssue"
      @change="refreshFavoriteIssues"
    />

    <LazyRepositoriesFavorites
      v-model:open="favoriteRepositoriesOpen"
      :favorites="favoriteRepositories"
      :repositories="syncedRepositories"
      @change="refreshFavoriteRepositories"
    />
  </UDashboardGroup>
</template>
