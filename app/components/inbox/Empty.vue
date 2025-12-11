<script setup lang="ts">
import type { Notification } from '#shared/types/notification'

defineProps<{
  unreadNotifications: Notification[]
}>()
</script>

<template>
  <div class="flex-1 flex flex-col items-center justify-center gap-4">
    <UIcon name="i-lucide-inbox" class="size-20 text-dimmed" />

    <p class="text-muted text-sm">
      <template v-if="unreadNotifications.length > 0">
        {{ unreadNotifications.length }} unread notification(s)
      </template>
      <template v-else>
        No notifications yet
      </template>
    </p>
  </div>
</template>
