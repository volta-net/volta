<script setup lang="ts">
import { breakpointsTailwind } from '@vueuse/core'
import type { Notification } from '#shared/types/notification'

const { data: notifications, refresh } = await useFetch<Notification[]>('/api/notifications')

const selectedNotification = ref<Notification | null>()

const unreadNotifications = computed(() => notifications.value?.filter(notification => !notification.read) ?? [])

// Refetch notifications when window gains focus
const focused = useWindowFocus()
watch(focused, async (isFocused) => {
  if (isFocused) {
    await refresh()
    // Sync selectedNotification with refreshed data
    if (selectedNotification.value) {
      selectedNotification.value = notifications.value?.find(n => n.id === selectedNotification.value?.id) ?? null
    }
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

useSeoMeta({
  title: () => `Inbox${unreadNotifications.value.length > 0 ? ` (${unreadNotifications.value.length})` : ''}`
})
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
            trailing-icon="i-lucide-ellipsis"
            class="data-[state=open]:bg-elevated"
          />
        </UDropdownMenu>
      </template>
    </UDashboardNavbar>

    <InboxNotifications
      v-model="selectedNotification"
      :notifications="notifications ?? []"
      @refresh="refresh"
    />

    <template #resize-handle="{ onMouseDown, onTouchStart, onDoubleClick }">
      <UDashboardResizeHandle
        class="after:absolute after:inset-y-0 after:right-0 after:w-px hover:after:bg-(--ui-border-accented) after:transition z-1"
        @mousedown="onMouseDown"
        @touchstart="onTouchStart"
        @dblclick="onDoubleClick"
      />
    </template>
  </UDashboardPanel>

  <UDashboardPanel v-if="selectedNotification" id="inbox-2">
    <InboxNotification
      :notification="selectedNotification"
      @close="selectedNotification = null"
      @refresh="refresh"
    />
  </UDashboardPanel>

  <UDashboardPanel v-else id="inbox-2" class="hidden lg:flex">
    <template #body>
      <UEmpty
        icon="i-lucide-inbox"
        :description="unreadNotifications.length > 0 ? `${unreadNotifications.length} unread notification(s)` : 'No notifications yet'"
        variant="naked"
        size="lg"
        class="flex-1"
      />
    </template>
  </UDashboardPanel>

  <ClientOnly>
    <USlideover
      v-if="isMobile && selectedNotification"
      v-model:open="isPanelOpen"
    >
      <template #content>
        <InboxNotification
          :notification="selectedNotification"
          @close="selectedNotification = null"
          @refresh="refresh"
        />
      </template>
    </USlideover>
  </ClientOnly>
</template>
