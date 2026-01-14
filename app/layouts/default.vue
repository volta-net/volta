<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

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
  router.push('/issues')
}

// Favorite repositories
const {
  favorites: favoriteRepositories,
  synced: syncedRepositories,
  open: favoriteRepositoriesOpen,
  refresh: refreshFavoriteRepositories
} = useFavoriteRepositories()

const links = computed<NavigationMenuItem[][]>(() => [[{
  label: 'Inbox',
  icon: 'i-lucide-inbox',
  to: '/inbox'
}, {
  label: 'Issues',
  icon: 'i-lucide-layout-list',
  to: '/issues'
}, {
  label: 'Favorites',
  icon: 'i-lucide-star',
  onSelect: () => { favoriteIssuesOpen.value = !favoriteIssuesOpen.value }
}, {
  label: 'Settings',
  icon: 'i-lucide-settings',
  to: '/settings'
}], [{
  label: 'Feedback',
  icon: 'i-lucide-message-circle',
  to: 'https://github.com/volta-net/volta',
  target: '_blank'
}]])

const groups = computed(() => [{
  id: 'links',
  items: [{
    label: 'Inbox',
    icon: 'i-lucide-inbox',
    to: '/inbox'
  }, {
    label: 'Issues',
    icon: 'i-lucide-layout-list',
    to: '/issues',
    children: [{
      label: 'Ready To Merge',
      icon: 'i-lucide-git-merge',
      to: '/issues?tab=merge',
      exactQuery: true
    }, {
      label: 'Needs Review',
      icon: 'i-lucide-eye',
      to: '/issues?tab=review',
      exactQuery: true
    }, {
      label: 'Needs Triage',
      icon: 'i-lucide-inbox',
      to: '/issues?tab=triage',
      exactQuery: true
    }]
  }, {
    label: 'Settings',
    icon: 'i-lucide-settings',
    to: '/settings'
  }]
}, {
  id: 'favorites',
  label: 'Favorites',
  items: [{
    label: 'Issues',
    icon: 'i-octicon-issue-opened-16',
    onSelect: () => { favoriteIssuesOpen.value = true }
  }, {
    label: 'Repositories',
    icon: 'i-lucide-package',
    onSelect: () => { favoriteRepositoriesOpen.value = true }
  }]
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
          color="neutral"
          tooltip
          popover
        />

        <UNavigationMenu
          :collapsed="collapsed"
          :items="links[1]"
          orientation="vertical"
          color="neutral"
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

    <UDashboardSearch :groups="groups" />

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
