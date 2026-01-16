<script setup lang="ts">
import type { Notification } from '#shared/types'

const props = defineProps<{
  notification: Notification
}>()

const emit = defineEmits<{
  (e: 'close' | 'refresh'): void
  (e: 'read' | 'delete', id: number): void
}>()

// Mark notification as read when notification changes (immediate handles initial mount)
watch(() => props.notification.id, async () => {
  if (!props.notification.read) {
    await $fetch(`/api/notifications/${props.notification.id}`, {
      method: 'PATCH',
      body: { read: true }
    })
    emit('read', props.notification.id)
  }
}, { immediate: true })
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden">
    <!-- Issue / Pull Request -->
    <NotificationIssue
      v-if="notification.issue"
      :notification="notification"
      @refresh="emit('refresh')"
      @delete="emit('delete', $event)"
    />

    <!-- Release -->
    <NotificationRelease
      v-else-if="notification.release"
      :notification="notification"
      @delete="emit('delete', $event)"
    />

    <!-- Workflow Run -->
    <NotificationWorkflow
      v-else-if="notification.workflowRun"
      :notification="notification"
      @delete="emit('delete', $event)"
    />

    <UEmpty
      v-else
      icon="i-lucide-inbox"
      description="No additional details"
      class="flex-1"
    />
  </div>
</template>
