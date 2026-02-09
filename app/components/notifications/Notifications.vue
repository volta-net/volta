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

const scrollArea = useTemplateRef('scrollArea')
const selectedNotification = defineModel<Notification | null>()

function scrollToSelected() {
  if (!selectedNotification.value) return

  const index = props.notifications.findIndex(n => n.id === selectedNotification.value!.id)
  if (index !== -1) {
    scrollArea.value?.virtualizer?.scrollToIndex(index)
  }
}

// Scroll when selection changes or when the list renders/updates with a selected item
// flush: 'post' ensures the virtualizer is ready before scrolling
watch([selectedNotification, () => props.notifications], scrollToSelected, { flush: 'post' })

// Keep selectedNotification in sync with notifications array after refresh
watch(() => props.notifications, (newNotifications) => {
  if (selectedNotification.value) {
    const updated = newNotifications.find(n => n.id === selectedNotification.value!.id)
    if (updated) {
      selectedNotification.value = updated
    }
  }
}, { deep: true })

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
      selectedNotification.value = props.notifications[0]!
    } else if (index < props.notifications.length - 1) {
      selectedNotification.value = props.notifications[index + 1]!
    }
  },
  arrowup: () => {
    const index = props.notifications.findIndex(notification => notification.id === selectedNotification.value?.id)

    if (index === -1) {
      selectedNotification.value = props.notifications[props.notifications.length - 1]!
    } else if (index > 0) {
      selectedNotification.value = props.notifications[index - 1]!
    }
  },
  u: toggleRead,
  d: () => emit('delete'),
  z: () => emit('undo')
})
</script>

<template>
  <UScrollArea
    ref="scrollArea"
    v-slot="{ item: notification }"
    :items="notifications"
    :virtualize="{
      estimateSize: 72,
      paddingStart: 4,
      paddingEnd: 4,
      scrollPaddingStart: 4,
      scrollPaddingEnd: 4
    }"
    class="isolate px-1 focus:outline-none"
  >
    <NotificationsItem
      :notification="notification"
      :selected="selectedNotification?.id === notification.id"
      :active-filters="activeFilters"
      @click="selectedNotification = notification"
      @filter="emit('filter', $event)"
    />
  </UScrollArea>
</template>
