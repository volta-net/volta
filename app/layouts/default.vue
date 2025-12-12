<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

useSeoMeta({
  titleTemplate: '%s - Volta'
})

const { data: favoriteIssues } = await useFetch('/api/favorites/issues', {
  default: () => []
})

const favoriteIssueItems = computed<NavigationMenuItem[]>(() => {
  if (!favoriteIssues.value || favoriteIssues.value.length === 0) {
    return []
  }

  return favoriteIssues.value.map(fav => ({
    label: `${fav.repository.fullName}#${fav.issue.number} ${fav.issue.title}`,
    icon: getIssueStateIcon(fav.issue),
    to: fav.issue.htmlUrl || '#',
    target: '_blank' as const
  }))
})

const links = computed<NavigationMenuItem[][]>(() => [[{
  label: 'Dashboard',
  icon: 'i-lucide-activity',
  to: '/'
}, {
  label: 'Inbox',
  icon: 'i-lucide-inbox',
  to: '/inbox'
}, ...(favoriteIssueItems.value.length > 0
  ? [{
      label: 'Favorites',
      icon: 'i-lucide-star',
      children: favoriteIssueItems.value
    }]
  : []), {
  label: 'Settings',
  icon: 'i-lucide-settings',
  to: '/settings'
}], [{
  label: 'Feedback',
  icon: 'i-lucide-message-circle',
  to: 'https://github.com/volta-net/volta',
  target: '_blank'
}]])
</script>

<template>
  <UDashboardGroup unit="rem">
    <UDashboardSidebar
      id="default"
      collapsed
      class="border-r-0 py-4"
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

    <div class="flex-1 flex m-4 lg:ml-0 rounded-md ring ring-default bg-default/75 shadow">
      <slot />
    </div>

    <UDashboardSearch />
  </UDashboardGroup>
</template>
