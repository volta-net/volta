<script setup lang="ts">
import { breakpointsTailwind } from '@vueuse/core'
import type { Notification } from '#shared/types'

const toast = useToast()
const confirm = useConfirmDialog()

const { data: notifications, status, refresh } = await useLazyFetch<Notification[]>('/api/notifications', {
  default: () => []
})

// Filters
const { filters, toggleFilter, clearFilters } = useFilters()

const selectedNotification = ref<Notification | null>()

// Stack of pending deletions (notifications to delete when their toast closes)
const pendingDeletes = ref<Notification[]>([])

// Set of pending delete IDs for quick lookup
const pendingDeleteIds = computed(() => new Set(pendingDeletes.value.map(n => n.id)))

// Visible notifications (excluding pending deletes and applying filters)
const visibleNotifications = computed(() => {
  const nonPending = notifications.value?.filter(n => !pendingDeleteIds.value.has(n.id)) ?? []
  return applyFilters(nonPending, filters.value, matchNotificationFilter)
})

const unreadNotifications = computed(() => notifications.value?.filter(notification => !notification.read) ?? [])

// Sync unread count to global state for app badge
const unreadCount = useUnreadCount()
watch(() => unreadNotifications.value.length, (count) => {
  unreadCount.value = count
}, { immediate: true })

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

// Keyboard shortcuts for bulk actions
defineShortcuts({
  meta_u: markAllAsRead,
  meta_d: deleteAll,
  shift_d: deleteAllRead
})

async function markAllAsRead() {
  if (filters.value.length) {
    // When filtered, only mark visible notifications as read
    await Promise.all(
      visibleNotifications.value
        .filter(n => !n.read)
        .map(n => $fetch(`/api/notifications/${n.id}`, { method: 'PATCH', body: { read: true } }))
    )
  } else {
    // No filters, use bulk API
    await $fetch('/api/notifications/read-all', { method: 'POST' })
  }
  await refresh()
}

async function deleteAll() {
  const count = filters.value.length ? visibleNotifications.value.length : notifications.value?.length ?? 0
  if (!count) return

  const confirmed = await confirm({
    title: filters.value.length ? 'Delete filtered notifications?' : 'Delete all notifications?',
    description: `This will permanently delete ${count} notification${count > 1 ? 's' : ''}. This action cannot be undone.`,
    icon: 'i-lucide-trash-2',
    confirmLabel: 'Delete'
  })

  if (!confirmed) return

  if (filters.value.length) {
    // When filtered, only delete visible notifications
    await Promise.all(
      visibleNotifications.value.map(n => $fetch(`/api/notifications/${n.id}`, { method: 'DELETE' }))
    )
  } else {
    // No filters, use bulk API
    await $fetch('/api/notifications', { method: 'DELETE' })
  }
  selectedNotification.value = null
  await refresh()
}

async function deleteAllRead() {
  const readNotifications = filters.value.length
    ? visibleNotifications.value.filter(n => n.read)
    : notifications.value?.filter(n => n.read) ?? []
  const count = readNotifications.length
  if (!count) return

  const confirmed = await confirm({
    title: filters.value.length ? 'Delete filtered read notifications?' : 'Delete all read notifications?',
    description: `This will permanently delete ${count} read notification${count > 1 ? 's' : ''}. This action cannot be undone.`,
    icon: 'i-lucide-trash-2',
    confirmLabel: 'Delete'
  })

  if (!confirmed) return

  if (filters.value.length) {
    // When filtered, only delete visible read notifications
    await Promise.all(
      readNotifications.map(n => $fetch(`/api/notifications/${n.id}`, { method: 'DELETE' }))
    )
  } else {
    // No filters, use bulk API
    await $fetch('/api/notifications/read', { method: 'DELETE' })
  }
  if (selectedNotification.value?.read) {
    selectedNotification.value = null
  }
  await refresh()
}

function updateReadState(notificationId: number, read: boolean) {
  if (!notifications.value) return

  const index = notifications.value.findIndex(n => n.id === notificationId)
  if (index !== -1) {
    const updatedNotification = { ...notifications.value[index], read } as Notification

    // Create a new array to trigger reactivity for computed properties
    notifications.value = notifications.value.map((n, i) => i === index ? updatedNotification : n)

    // Also update selectedNotification if it's the same notification
    if (selectedNotification.value?.id === notificationId) {
      selectedNotification.value = updatedNotification
    }
  }
}

function markAsRead(notificationId: number) {
  updateReadState(notificationId, true)
}

// Delete notification (deferred until toast closes)
function deleteNotification() {
  if (!selectedNotification.value) return

  const notification = selectedNotification.value

  // Get the index BEFORE adding to pending deletes (since visibleNotifications will change)
  const index = visibleNotifications.value.findIndex(n => n.id === notification.id)

  // Add to pending deletes stack
  pendingDeletes.value.push(notification)

  // After push, visibleNotifications has shifted - the item at `index` is now what was at `index + 1`
  if (visibleNotifications.value.length > 0) {
    if (index < visibleNotifications.value.length) {
      // Select the item that's now at the same index (was the next item)
      selectedNotification.value = visibleNotifications.value[index]
    } else {
      // We were at the end, select the new last item
      selectedNotification.value = visibleNotifications.value[visibleNotifications.value.length - 1]
    }
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

  // Remove from local state instead of refetching
  notifications.value = notifications.value?.filter(n => n.id !== notification.id) ?? []
  pendingDeletes.value = pendingDeletes.value.filter(n => n.id !== notification.id)
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
    :ui="{ body: 'overflow-hidden p-0!' }"
  >
    <template #header>
      <UDashboardNavbar :ui="{ left: 'shrink-0', right: 'shrink min-w-0' }">
        <template #title>
          <span class="inline-flex">Inbox</span>

          <UBadge
            :label="String(notifications.length)"
            variant="subtle"
            size="sm"
          />
        </template>

        <template #right>
          <Filters
            :filters="filters"
            @toggle="toggleFilter"
            @clear="clearFilters"
          />

          <UDropdownMenu
            :content="{ align: 'start' }"
            :items="[[{
              label: filters.length ? 'Mark filtered as read' : 'Mark all as read',
              icon: 'i-lucide-check-circle',
              kbds: ['meta', 'u'],
              onSelect: markAllAsRead
            }], [{
              label: filters.length ? 'Delete filtered' : 'Delete all',
              icon: 'i-lucide-trash-2',
              kbds: ['meta', 'd'],
              onSelect: deleteAll
            }, {
              label: filters.length ? 'Delete filtered read' : 'Delete all read',
              icon: 'i-lucide-trash-2',
              kbds: ['shift', 'd'],
              onSelect: deleteAllRead
            }]]"
          >
            <UButton
              variant="ghost"
              trailing-icon="i-lucide-ellipsis"
              class="data-[state=open]:bg-elevated -mr-1.5"
            />
          </UDropdownMenu>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <!-- Loading state (only on initial load, not refetches) -->
      <AppLoading v-if="status === 'pending' && !notifications?.length" />

      <Notifications
        v-else
        v-model="selectedNotification"
        :notifications="visibleNotifications"
        :active-filters="filters"
        @toggle-read="updateReadState"
        @delete="deleteNotification"
        @undo="undoDelete"
        @filter="toggleFilter"
      />
    </template>

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
      v-if="isMobile"
      v-model:open="isPanelOpen"
      inset
    >
      <template #content="{ close }">
        <Notification
          v-if="selectedNotification"
          :notification="selectedNotification!"
          :on-close="close"
          @refresh="refresh"
          @read="markAsRead"
          @delete="deleteNotification"
        />
      </template>
    </USlideover>
  </ClientOnly>
</template>
