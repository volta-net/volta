<script setup lang="ts">
import type { Notification } from '#shared/types'

const props = defineProps<{
  notifications: Notification[]
}>()

const emit = defineEmits<{
  delete: []
  undo: []
  toggleRead: [id: number, read: boolean]
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

// Toggle read/unread
async function toggleRead() {
  if (!selectedNotification.value) return

  const notification = selectedNotification.value
  const newReadState = !notification.read

  await $fetch(`/api/notifications/${notification.id}`, {
    method: 'PATCH',
    body: { read: newReadState }
  })
  emit('toggleRead', notification.id, newReadState)
}

defineShortcuts({
  arrowdown: () => {
    const index = props.notifications.findIndex(notification => notification.id === selectedNotification.value?.id)

    if (index === -1) {
      selectNotification(props.notifications[0])
    } else if (index < props.notifications.length - 1) {
      selectNotification(props.notifications[index + 1])
    }
  },
  arrowup: () => {
    const index = props.notifications.findIndex(notification => notification.id === selectedNotification.value?.id)

    if (index === -1) {
      selectNotification(props.notifications[props.notifications.length - 1])
    } else if (index > 0) {
      selectNotification(props.notifications[index - 1])
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
      @click="selectNotification(notification)"
    />
  </div>
</template>
