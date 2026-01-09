<script setup lang="ts">
import type { Notification } from '#shared/types'

const props = defineProps<{
  notification: Notification
}>()

const emit = defineEmits<{
  (e: 'refresh'): void
  (e: 'read', id: number): void
}>()

// Mark notification as read on mount if unread
onMounted(async () => {
  if (!props.notification.read) {
    await $fetch(`/api/notifications/${props.notification.id}`, {
      method: 'PATCH',
      body: { read: true }
    })
    emit('read', props.notification.id)
  }
})
</script>

<template>
  <Issue
    v-if="notification.issue && notification.repository"
    :item="{
      ...notification.issue,
      repository: notification.repository
    }"
    @refresh="emit('refresh')"
  >
    <template #right>
      <slot name="right" />
    </template>
  </Issue>
</template>
