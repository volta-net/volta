<script setup lang="ts">
import type { Notification } from '#shared/types/notification'

defineProps<{
  notification: Notification
}>()

const emit = defineEmits<{
  (e: 'close' | 'refresh'): void
  (e: 'read', id: number): void
}>()
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden">
    <!-- Issue / Pull Request -->
    <InboxNotificationIssue
      v-if="notification.issue"
      :notification="notification"
      @refresh="emit('refresh')"
      @read="emit('read', $event)"
    />

    <!-- Release -->
    <InboxNotificationRelease
      v-else-if="notification.release"
      :notification="notification"
      @read="emit('read', $event)"
    />

    <!-- Workflow Run -->
    <InboxNotificationWorkflow
      v-else-if="notification.workflowRun"
      :notification="notification"
      @read="emit('read', $event)"
    />

    <UEmpty
      v-else
      icon="i-lucide-inbox"
      description="No additional details"
      class="flex-1"
    />
  </div>
</template>
