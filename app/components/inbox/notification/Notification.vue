<script setup lang="ts">
import type { Notification } from '#shared/types/notification'

defineProps<{
  notification: Notification
}>()

const emit = defineEmits<{
  (e: 'close' | 'refresh'): void
}>()
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden">
    <!-- Issue / Pull Request -->
    <InboxNotificationIssue
      v-if="notification.issue"
      :notification="notification"
      @refresh="emit('refresh')"
    />

    <!-- Release -->
    <InboxNotificationRelease
      v-else-if="notification.release"
      :notification="notification"
    />

    <!-- Workflow Run -->
    <InboxNotificationWorkflow
      v-else-if="notification.workflowRun"
      :notification="notification"
    />

    <!-- Unknown/Generic notification -->
    <div v-else class="flex flex-col gap-4 p-4">
      <p v-if="notification?.body" class="text-muted text-sm">
        {{ notification.body }}
      </p>
      <p v-else class="text-dimmed text-sm">
        No additional details
      </p>
    </div>
  </div>
</template>
