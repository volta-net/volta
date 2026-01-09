<script setup lang="ts">
import type { Notification } from '#shared/types'

const props = defineProps<{
  notifications: Notification[]
}>()

const emit = defineEmits<{
  refresh: []
}>()

const toast = useToast()
const notificationsRefs = ref<Record<string, Element>>({})
const selectedNotification = defineModel<Notification | null>()

// Stack of pending deletions (notifications to delete when their toast closes)
const pendingDeletes = ref<Notification[]>([])

// Set of pending delete IDs for quick lookup in template
const pendingDeleteIds = computed(() => new Set(pendingDeletes.value.map(n => n.id)))

watch(selectedNotification, () => {
  if (!selectedNotification.value) {
    return
  }
  const ref = notificationsRefs.value[selectedNotification.value.id]
  if (ref) {
    ref.scrollIntoView({ block: 'nearest' })
  }
})

// Keep selectedNotification in sync with notifications array after refresh
// Also clean up pendingDeletes for notifications that no longer exist
watch(() => props.notifications, (newNotifications) => {
  if (selectedNotification.value) {
    const updated = newNotifications.find(n => n.id === selectedNotification.value!.id)
    if (updated) {
      selectedNotification.value = updated
    }
  }

  // Remove stale entries from pendingDeletes (notifications that were deleted from server)
  const notificationIds = new Set(newNotifications.map(n => n.id))
  pendingDeletes.value = pendingDeletes.value.filter(n => notificationIds.has(n.id))
}, { deep: true })

// Toggle read/unread
async function toggleRead() {
  if (!selectedNotification.value) return

  const notification = selectedNotification.value
  const newReadState = !notification.read

  // Optimistic update
  notification.read = newReadState

  await $fetch(`/api/notifications/${notification.id}`, {
    method: 'PATCH',
    body: { read: newReadState }
  })
  emit('refresh')
}

// Delete notification (deferred until toast closes)
function deleteNotification() {
  if (!selectedNotification.value) return

  const notification = selectedNotification.value

  // Add to pending deletes stack
  pendingDeletes.value.push(notification)

  // Move selection to next notification (skip other pending deletes)
  const visibleNotifications = props.notifications.filter(n => !pendingDeleteIds.value.has(n.id))
  const index = visibleNotifications.findIndex(n => n.id === notification.id)
  if (index < visibleNotifications.length - 1) {
    selectedNotification.value = visibleNotifications[index + 1]
  } else if (index > 0) {
    selectedNotification.value = visibleNotifications[index - 1]
  } else {
    selectedNotification.value = null
  }

  // Show toast - actual deletion happens when toast closes
  toast.add({
    'id': `notification-deleted-${notification.id}`,
    'title': 'Notification deleted',
    'orientation': 'horizontal',
    'actions': [{
      label: 'Undo',
      icon: 'i-lucide-undo',
      onClick: undoDelete
    }],
    'icon': 'i-lucide-trash-2',
    'onUpdate:open': (open) => {
      if (!open) {
        executeDelete(notification)
      }
    }
  })
}

// Execute delete for a specific notification
async function executeDelete(notification: Notification) {
  // Check if still in pending (not undone)
  if (!pendingDeletes.value.some(n => n.id === notification.id)) return

  // Delete from server (keep hidden via pendingDeletes until refresh completes)
  await $fetch(`/api/notifications/${notification.id}`, {
    method: 'DELETE'
  })

  // Refresh will update notifications, and the watch will clean up pendingDeletes
  emit('refresh')
}

// Undo most recent delete
function undoDelete() {
  if (!pendingDeletes.value.length) return

  // Get most recent pending delete
  const notification = pendingDeletes.value.pop()!

  // Remove its toast
  toast.remove(`notification-deleted-${notification.id}`)
}

defineShortcuts({
  arrowdown: () => {
    const index = props.notifications.findIndex(notification => notification.id === selectedNotification.value?.id)

    if (index === -1) {
      selectedNotification.value = props.notifications[0]
    } else if (index < props.notifications.length - 1) {
      selectedNotification.value = props.notifications[index + 1]
    }
  },
  arrowup: () => {
    const index = props.notifications.findIndex(notification => notification.id === selectedNotification.value?.id)

    if (index === -1) {
      selectedNotification.value = props.notifications[props.notifications.length - 1]
    } else if (index > 0) {
      selectedNotification.value = props.notifications[index - 1]
    }
  },
  u: toggleRead,
  d: deleteNotification,
  z: undoDelete
})
</script>

<template>
  <div class="overflow-y-auto p-1 scroll-py-1 isolate focus:outline-none">
    <template v-for="notification in notifications" :key="notification.id">
      <NotificationsItem
        v-if="!pendingDeleteIds.has(notification.id)"
        :ref="(el: any) => { notificationsRefs[notification.id] = el?.$el as Element }"
        :notification="notification"
        :selected="selectedNotification?.id === notification.id"
        @click="selectedNotification = notification"
      />
    </template>
  </div>
</template>
