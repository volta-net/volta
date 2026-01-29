<script setup lang="ts">
import type { Notification } from '#shared/types'
import type { Filter } from '~/composables/useFilters'

const props = defineProps<{
  notifications: Notification[]
  activeFilters?: readonly Filter[]
}>()

const emit = defineEmits<{
  delete: []
  undo: []
  toggleRead: [id: number, read: boolean]
  filter: [filter: Filter]
}>()

const notificationsRefs = ref<Record<string, Element>>({})
const selectedNotification = defineModel<Notification | null>()

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
watch(() => props.notifications, (newNotifications) => {
  if (selectedNotification.value) {
    const updated = newNotifications.find(n => n.id === selectedNotification.value!.id)
    if (updated) {
      selectedNotification.value = updated
    }
  }
}, { deep: true })

function selectNotification(notification: Notification) {
  selectedNotification.value = notification
}

// Toggle read/unread (optimistic update)
function toggleRead() {
  if (!selectedNotification.value) return

  const notification = selectedNotification.value
  const newReadState = !notification.read

  // Optimistically update UI immediately
  emit('toggleRead', notification.id, newReadState)

  // Persist to server in background
  $fetch(`/api/notifications/${notification.id}`, {
    method: 'PATCH',
    body: { read: newReadState }
  }).catch(() => {
    // Rollback on error
    emit('toggleRead', notification.id, !newReadState)
  })
}

defineShortcuts({
  arrowdown: () => {
    const index = props.notifications.findIndex(notification => notification.id === selectedNotification.value?.id)

    if (index === -1) {
      selectNotification(props.notifications[0]!)
    } else if (index < props.notifications.length - 1) {
      selectNotification(props.notifications[index + 1]!)
    }
  },
  arrowup: () => {
    const index = props.notifications.findIndex(notification => notification.id === selectedNotification.value?.id)

    if (index === -1) {
      selectNotification(props.notifications[props.notifications.length - 1]!)
    } else if (index > 0) {
      selectNotification(props.notifications[index - 1]!)
    }
  },
  u: toggleRead,
  d: () => emit('delete'),
  z: () => emit('undo')
})
</script>

<template>
  <div class="overflow-y-auto p-1 scroll-py-1 isolate focus:outline-none">
    <NotificationsItem
      v-for="notification in notifications"
      :key="notification.id"
      :ref="(el: any) => { notificationsRefs[notification.id] = el?.$el as Element }"
      :notification="notification"
      :selected="selectedNotification?.id === notification.id"
      :active-filters="activeFilters"
      @click="selectNotification(notification)"
      @filter="emit('filter', $event)"
    />
  </div>
</template>
