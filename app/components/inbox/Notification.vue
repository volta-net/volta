<script setup lang="ts">
import type { Notification } from '#shared/types/notification'

defineProps<{
  notification: Notification
}>()

defineEmits<{
  (e: 'close'): void
}>()
</script>

<template>
  <div class="flex flex-col gap-4 p-4">
    <p v-if="notification?.body" class="text-muted text-sm">
      {{ notification.body }}
    </p>
    <p v-else class="text-dimmed text-sm">
      No additional details
    </p>

    <!-- Link to GitHub -->
    <UButton
      v-if="notification.issue?.htmlUrl || notification.release?.htmlUrl || notification.workflowRun?.htmlUrl"
      :to="(notification.issue?.htmlUrl || notification.release?.htmlUrl || notification.workflowRun?.htmlUrl)!"
      target="_blank"
      color="neutral"
      variant="soft"
      icon="i-lucide-external-link"
      class="self-start"
    >
      View on GitHub
    </UButton>
  </div>
</template>
