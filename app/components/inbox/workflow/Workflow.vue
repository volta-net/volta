<script setup lang="ts">
import type { Notification } from '#shared/types/notification'

defineProps<{
  notification: Notification
}>()

function getConclusionColor(conclusion: string | null | undefined): string {
  switch (conclusion) {
    case 'success':
      return 'text-emerald-500'
    case 'failure':
      return 'text-red-500'
    case 'cancelled':
      return 'text-gray-400'
    case 'skipped':
      return 'text-gray-400'
    default:
      return 'text-yellow-500'
  }
}

function getConclusionIcon(conclusion: string | null | undefined): string {
  switch (conclusion) {
    case 'success':
      return 'i-octicon-check-circle-fill-16'
    case 'failure':
      return 'i-octicon-x-circle-fill-16'
    case 'cancelled':
      return 'i-octicon-stop-16'
    case 'skipped':
      return 'i-octicon-skip-16'
    default:
      return 'i-octicon-clock-16'
  }
}

function getConclusionBadge(conclusion: string | null | undefined): { label: string, color: 'success' | 'error' | 'neutral' | 'warning' } {
  switch (conclusion) {
    case 'success':
      return { label: 'Success', color: 'success' }
    case 'failure':
      return { label: 'Failed', color: 'error' }
    case 'cancelled':
      return { label: 'Cancelled', color: 'neutral' }
    case 'skipped':
      return { label: 'Skipped', color: 'neutral' }
    default:
      return { label: 'Running', color: 'warning' }
  }
}
</script>

<template>
  <!-- Navbar -->
  <UDashboardNavbar>
    <template v-if="notification.repository" #leading>
      <UButton
        :label="notification.repository.fullName"
        :avatar="{ src: `https://github.com/${notification.repository.fullName.split('/')[0]}.png`, alt: notification.repository.fullName }"
        :to="notification.repository.htmlUrl!"
        target="_blank"
        color="neutral"
        variant="ghost"
        size="sm"
      />
    </template>
    <template #title>
      {{ notification.workflowRun?.workflowName || notification.workflowRun?.name }}
    </template>
    <template #right>
      <UButton
        v-if="notification.workflowRun?.htmlUrl"
        icon="i-simple-icons-github"
        color="neutral"
        variant="ghost"
        size="sm"
        :to="notification.workflowRun.htmlUrl"
        target="_blank"
      />
    </template>
  </UDashboardNavbar>

  <div class="flex-1 overflow-y-auto">
    <div class="p-4 space-y-6">
      <!-- Header -->
      <div class="flex items-start justify-between gap-4">
        <div class="flex items-center gap-3 min-w-0">
          <div class="flex items-center justify-center size-10 rounded-full shrink-0" :class="getConclusionColor(notification.workflowRun?.conclusion).replace('text-', 'bg-') + '/10'">
            <UIcon :name="getConclusionIcon(notification.workflowRun?.conclusion)" class="size-5" :class="getConclusionColor(notification.workflowRun?.conclusion)" />
          </div>
          <div class="min-w-0">
            <h2 class="font-semibold text-highlighted truncate">
              {{ notification.workflowRun?.name }}
            </h2>
            <UBadge v-bind="getConclusionBadge(notification.workflowRun?.conclusion)" variant="subtle" class="mt-1" />
          </div>
        </div>
      </div>

      <!-- Body/Description -->
      <div v-if="notification.body" class="prose prose-sm dark:prose-invert max-w-none">
        <p class="text-muted whitespace-pre-wrap">
          {{ notification.body }}
        </p>
      </div>

      <!-- Actor -->
      <div v-if="notification.actor" class="flex items-center gap-2 pt-4 border-t border-default">
        <UAvatar :src="notification.actor.avatarUrl" :alt="notification.actor.login" size="xs" />
        <span class="text-sm text-muted">Triggered by <span class="text-highlighted">{{ notification.actor.login }}</span></span>
      </div>
    </div>
  </div>
</template>
