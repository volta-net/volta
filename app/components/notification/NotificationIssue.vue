<script setup lang="ts">
import type { Notification } from '#shared/types'

const props = defineProps<{
  notification: Notification
  onClose?: () => void
}>()

const emit = defineEmits<{
  (e: 'refresh'): void
  (e: 'delete', id: number): void
}>()
</script>

<template>
  <Issue
    v-if="notification.issue && notification.repository"
    :item="{
      ...notification.issue,
      repository: notification.repository
    }"
    :on-close="props.onClose"
    @refresh="emit('refresh')"
  >
    <template #right>
      <UTooltip text="Delete notification" :kbds="['d']">
        <UButton
          icon="i-lucide-trash-2"
          label="Delete notification"
          variant="soft"
          @click="emit('delete', notification.id)"
        />
      </UTooltip>
    </template>
  </Issue>
</template>
