<script setup lang="ts">
import { breakpointsTailwind } from '@vueuse/core'
import type { Notification } from '#shared/types'

const toast = useToast()

const { data: notifications, refresh } = await useFetch<Notification[]>('/api/notifications')

const selectedNotification = ref<Notification | null>()

// Stack of pending deletions (notifications to delete when their toast closes)
const pendingDeletes = ref<Notification[]>([])

// Set of pending delete IDs for quick lookup
const pendingDeleteIds = computed(() => new Set(pendingDeletes.value.map(n => n.id)))

// Visible notifications (excluding pending deletes)
const visibleNotifications = computed(() => notifications.value?.filter(n => !pendingDeleteIds.value.has(n.id)) ?? [])

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

// Clean up pendingDeletes for notifications that no longer exist
watch(notifications, (newNotifications) => {
  if (!newNotifications) return
  const notificationIds = new Set(newNotifications.map(n => n.id))
  pendingDeletes.value = pendingDeletes.value.filter(n => notificationIds.has(n.id))
}, { deep: true })

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

function markAsRead(notificationId: number) {
  if (!notifications.value) return

  const index = notifications.value.findIndex(n => n.id === notificationId)
  if (index !== -1) {
    // Replace the notification object to trigger reactivity
    const updatedNotification = { ...notifications.value[index], read: true } as Notification
    notifications.value[index] = updatedNotification

    // Also update selectedNotification if it's the same notification
    if (selectedNotification.value?.id === notificationId) {
      selectedNotification.value = updatedNotification
    }
  }
}

// Delete notification (deferred until toast closes)
function deleteNotification() {
  if (!selectedNotification.value) return

  const notification = selectedNotification.value

  // Add to pending deletes stack
  pendingDeletes.value.push(notification)

  // Move selection to next notification (skip other pending deletes)
  const index = visibleNotifications.value.findIndex(n => n.id === notification.id)
  if (index < visibleNotifications.value.length - 1) {
    selectedNotification.value = visibleNotifications.value[index + 1]
  } else if (index > 0) {
    selectedNotification.value = visibleNotifications.value[index - 1]
  } else {
    selectedNotification.value = null
  }

  // Show toast - actual deletion happens when toast closes
  toast.add({
    'id': `notification-deleted-${notification.id}`,
    'title': 'Notification deleted',
    'icon': 'i-lucide-trash-2',
    'orientation': 'horizontal',
    'actions': [{
      label: 'Undo',
      color: 'neutral',
      variant: 'outline',
      icon: 'i-lucide-undo',
      onClick: undoDelete
    }],
    'onUpdate:open': (open) => {
      if (!open) {
        // Delay to allow onClick handler to run first when undo is clicked
        setTimeout(() => executeDelete(notification), 0)
      }
    }
  })
}

// Execute delete for a specific notification
async function executeDelete(notification: Notification) {
  // Check if still in pending (not undone)
  if (!pendingDeletes.value.some(n => n.id === notification.id)) return

  // Delete from server
  await $fetch(`/api/notifications/${notification.id}`, {
    method: 'DELETE'
  })

  // Refresh will update notifications, and the watch will clean up pendingDeletes
  await refresh()
}

// Undo most recent delete
function undoDelete() {
  if (!pendingDeletes.value.length) return

  // Get most recent pending delete
  const notification = pendingDeletes.value.pop()!

  // Remove its toast
  toast.remove(`notification-deleted-${notification.id}`)
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
    <UDashboardNavbar>
      <template #title>
        <span class="inline-flex">Inbox</span>

        <UBadge :label="String(unreadNotifications.length)" color="neutral" variant="subtle" />
      </template>

      <template #right>
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
            class="data-[state=open]:bg-elevated -mr-1.5"
          />
        </UDropdownMenu>
      </template>
    </UDashboardNavbar>

    <Notifications
      v-model="selectedNotification"
      :notifications="visibleNotifications"
      @refresh="refresh"
      @delete="deleteNotification"
      @undo="undoDelete"
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
    <Notification
      :notification="selectedNotification"
      @close="selectedNotification = null"
      @refresh="refresh"
      @read="markAsRead"
      @delete="deleteNotification"
    />
  </UDashboardPanel>

  <UDashboardPanel v-else id="inbox-2" class="hidden lg:flex">
    <template #body>
      <UEmpty
        icon="i-lucide-inbox"
        :description="unreadNotifications.length > 0 ? `${unreadNotifications.length} unread notification(s)` : 'No notifications yet'"
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
        <Notification
          :notification="selectedNotification"
          @close="selectedNotification = null"
          @refresh="refresh"
          @read="markAsRead"
          @delete="deleteNotification"
        />
      </template>
    </USlideover>
  </ClientOnly>
</template>
