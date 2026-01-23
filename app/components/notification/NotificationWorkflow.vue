<script setup lang="ts">
import type { Notification } from '#shared/types'

const props = defineProps<{
  notification: Notification
  onClose?: () => void
}>()

const emit = defineEmits<{
  (e: 'delete', id: number): void
}>()

// CI state for the workflow conclusion
const ciState = computed(() => getCIState(props.notification.workflowRun?.conclusion))

// Build a human-friendly description
const description = computed(() => {
  const run = props.notification.workflowRun
  if (!run) return 'Workflow run completed'

  const status = ciState.value.label.toLowerCase()
  const branch = run.headBranch ? ` on branch ${run.headBranch}` : ''

  return `Workflow run ${status}${branch}`
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
        variant="ghost"
        class="text-sm/4 text-highlighted px-2"
      />

      <UIcon name="i-lucide-chevron-right" class="size-4 text-muted" />
    </template>

    <template #title>
      <UTooltip text="Open on GitHub" :kbds="['meta', 'g']">
        <UButton
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
          variant="soft"
          class="hidden lg:inline-flex"
          @click="emit('delete', notification.id)"
        />
      </UTooltip>

      <UButton
        v-if="onClose"
        icon="i-lucide-x"
        variant="soft"
        @click="onClose"
      />
    </template>
  </UDashboardNavbar>

  <div class="flex-1 flex items-center justify-center">
    <UEmpty
      :icon="ciState.icon"
      :description="description"
      :actions="[{
        label: 'Open on GitHub',
        icon: 'i-simple-icons-github',
        variant: 'soft',
        to: notification.workflowRun?.htmlUrl!,
        target: '_blank'
      }]"
    />
  </div>
</template>
