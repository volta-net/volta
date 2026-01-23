<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

useSeoMeta({
  title: 'Settings'
})

const links = [{
  label: 'Repositories',
  icon: 'i-lucide-package',
  to: '/settings',
  exact: true
}, {
  label: 'AI Gateway',
  icon: 'i-lucide-sparkles',
  to: '/settings/ai'
}] satisfies NavigationMenuItem[]
</script>

<template>
  <UDashboardPanel id="settings" :ui="{ body: 'lg:py-12' }">
    <template #header>
      <UDashboardNavbar title="Settings" />

      <UDashboardToolbar class="min-h-0">
        <UNavigationMenu
          :items="links"
          class="-mx-2.5 flex-1"
          :ui="{ item: 'py-1.5' }"
        />
      </UDashboardToolbar>
    </template>

    <template #body>
      <div class="flex-1 flex flex-col gap-4 sm:gap-6 lg:gap-12 w-full lg:max-w-2xl mx-auto min-h-0">
        <NuxtPage />
      </div>
    </template>
  </UDashboardPanel>
</template>
