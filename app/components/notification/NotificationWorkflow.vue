<script setup lang="ts">
import type { Notification } from '#shared/types'

const props = defineProps<{
  notification: Notification
}>()

const emit = defineEmits<{
  (e: 'read' | 'delete', id: number): void
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

defineShortcuts({
  meta_g: () => {
    if (props.notification.workflowRun?.htmlUrl) {
      window.open(props.notification.workflowRun.htmlUrl, '_blank')
    }
  }
})
</script>

<template>
  <UDashboardNavbar :ui="{ left: 'gap-0.5' }">
    <template v-if="notification.repository" #leading>
      <UButton
        :label="notification.repository.fullName"
        :avatar="{ src: `https://github.com/${notification.repository.fullName.split('/')[0]}.png`, alt: notification.repository.fullName }"
        :to="notification.repository.htmlUrl!"
        target="_blank"
        color="neutral"
        variant="ghost"
        class="text-sm/4 text-highlighted px-2"
      />

      <UIcon name="i-lucide-chevron-right" class="size-4 text-muted" />
    </template>

    <template #title>
      <UTooltip text="Open on GitHub" :kbds="['meta', 'g']">
        <UButton
          color="neutral"
          variant="ghost"
          :label="notification.workflowRun?.workflowName || notification.workflowRun?.name!"
          :to="notification.workflowRun?.htmlUrl!"
          target="_blank"
          class="text-sm/4 text-highlighted px-2"
        />
      </UTooltip>
    </template>

    <template #right>
      <UTooltip text="Delete notification" :kbds="['d']">
        <UButton
          icon="i-lucide-trash-2"
          label="Delete notification"
          color="neutral"
          variant="soft"
          @click="emit('delete', notification.id)"
        />
      </UTooltip>
    </template>
  </UDashboardNavbar>

  <div class="flex-1 flex items-center justify-center">
    <UEmpty
      icon="i-lucide-workflow"
      description="View workflow run on GitHub"
      :actions="[{
        label: 'Open on GitHub',
        icon: 'i-simple-icons-github',
        color: 'neutral',
        variant: 'soft',
        to: notification.workflowRun?.htmlUrl!,
        target: '_blank'
      }]"
    />
  </div>
</template>
