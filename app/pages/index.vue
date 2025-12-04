<script setup lang="ts">
import { breakpointsTailwind } from '@vueuse/core'
import type { Notification } from '~~/shared/types/notification'

const { data: notifications, refresh } = await useFetch<Notification[]>('/api/notifications')

const selectedNotification = ref<Notification | null>()
const unreadNotifications = computed(() => notifications.value?.filter(notification => !notification.read) ?? [])

// Refetch notifications when window regains focus
const focused = useWindowFocus()
watch(focused, (isFocused) => {
  if (isFocused) {
    refresh()
  }
})

const isPanelOpen = computed({
  get() {
    return !!selectedNotification.value
  },
  set(value: boolean) {
    if (!value) {
      selectedNotification.value = null
    }
  }
})

const breakpoints = useBreakpoints(breakpointsTailwind)
const isMobile = breakpoints.smaller('lg')

async function markAllAsRead() {
  await $fetch('/api/notifications/read-all', { method: 'POST' })
  await refresh()
}

async function deleteAll() {
  await $fetch('/api/notifications', { method: 'DELETE' })
  selectedNotification.value = null
  await refresh()
}

async function deleteAllRead() {
  await $fetch('/api/notifications/read', { method: 'DELETE' })
  if (selectedNotification.value?.read) {
    selectedNotification.value = null
  }
  await refresh()
}
</script>

<template>
  <UDashboardPanel
    id="inbox-1"
    :default-size="25"
    :min-size="20"
    :max-size="30"
    resizable
  >
    <UDashboardNavbar title="Inbox">
      <template #trailing>
        <UDropdownMenu
          :content="{ align: 'start' }"
          size="sm"
          :items="[[{
            label: 'Mark all as read',
            icon: 'i-lucide-check-circle',
            onSelect: markAllAsRead
          }], [{
            label: 'Delete all',
            icon: 'i-lucide-trash-2',
            onSelect: deleteAll
          }, {
            label: 'Delete all read',
            icon: 'i-lucide-trash-2',
            onSelect: deleteAllRead
          }]]"
        >
          <UButton
            variant="ghost"
            color="neutral"
            size="sm"
            trailing-icon="i-lucide-ellipsis"
          />
        </UDropdownMenu>
      </template>
    </UDashboardNavbar>

    <NotificationsList
      v-model="selectedNotification"
      :notifications="notifications ?? []"
      @refresh="refresh"
    />
  </UDashboardPanel>

  <UDashboardPanel v-if="selectedNotification">
    <template #header>
      <UDashboardNavbar>
        <template #title>
          <template v-if="selectedNotification.issue">
            #{{ selectedNotification.issue.number }} {{ selectedNotification.issue.title }}
          </template>
        </template>
      </UDashboardNavbar>
    </template>

    <template #content>
      <div class="flex flex-col gap-4 p-4">
        <p v-if="selectedNotification?.body" class="text-muted text-sm">
          {{ selectedNotification.body }}
        </p>
        <p v-else class="text-dimmed text-sm">
          No additional details
        </p>
      </div>
    </template>
  </UDashboardPanel>

  <UDashboardPanel v-else>
    <div class="flex-1 flex flex-col items-center justify-center gap-4">
      <UIcon name="i-lucide-inbox" class="size-20 text-dimmed" />

      <p class="text-muted text-sm">
        <template v-if="unreadNotifications.length > 0">
          {{ unreadNotifications.length }} unread notification(s)
        </template>
        <template v-else>
          No notifications yet
        </template>
      </p>
    </div>
  </UDashboardPanel>

  <ClientOnly>
    <USlideover
      v-if="isMobile"
      v-model:open="isPanelOpen"
    >
      <template #content>
        <!-- <InboxNotification
          v-if="selectedNotification"
          :notification="selectedNotification"
          @close="selectedNotification = null"
        /> -->
      </template>
    </USlideover>
  </ClientOnly>
</template>
