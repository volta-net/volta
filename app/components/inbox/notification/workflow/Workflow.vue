<script setup lang="ts">
import type { Notification } from '#shared/types/notification'

const props = defineProps<{
  notification: Notification
}>()

defineShortcuts({
  meta_g: () => {
    if (props.notification.workflowRun?.htmlUrl) {
      window.open(props.notification.workflowRun.htmlUrl, '_blank')
    }
  }
})
</script>

<template>
  <!-- Navbar -->
  <UDashboardNavbar :ui="{ title: 'text-sm font-medium' }">
    <template v-if="notification.repository" #leading>
      <UButton
        :label="notification.repository.fullName"
        :avatar="{ src: `https://github.com/${notification.repository.fullName.split('/')[0]}.png`, alt: notification.repository.fullName }"
        :to="notification.repository.htmlUrl!"
        target="_blank"
        color="neutral"
        variant="ghost"
        class="text-sm/4 text-highlighted -mx-1.5"
        square
      />

      <UIcon name="i-lucide-chevron-right" class="size-4 text-muted" />
    </template>

    <template #title>
      {{ notification.workflowRun?.workflowName || notification.workflowRun?.name }}
    </template>

    <template #right>
      <UTooltip text="Open on GitHub" :kbds="['meta', 'g']">
        <UButton
          v-if="notification.workflowRun?.htmlUrl"
          icon="i-simple-icons-github"
          color="neutral"
          variant="subtle"
          :to="notification.workflowRun.htmlUrl"
          target="_blank"
        />
      </UTooltip>
    </template>
  </UDashboardNavbar>

  <div class="flex-1 overflow-y-auto">
    <div class="p-4 space-y-6">
      <!-- Header -->
      <div class="flex items-start justify-between gap-4">
        <div class="flex items-center gap-3 min-w-0">
          <div class="flex items-center justify-center size-10 rounded-full shrink-0" :class="getCIStateColor(notification.workflowRun?.conclusion).replace('text-', 'bg-') + '/10'">
            <UIcon :name="getCIStateIcon(notification.workflowRun?.conclusion)" class="size-5" :class="getCIStateColor(notification.workflowRun?.conclusion)" />
          </div>
          <div class="min-w-0">
            <h2 class="font-semibold text-highlighted truncate">
              {{ notification.workflowRun?.name }}
            </h2>
            <UBadge v-bind="getCIStateBadge(notification.workflowRun?.conclusion)" variant="subtle" class="mt-1" />
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
        <UAvatar :src="notification.actor.avatarUrl || undefined" :alt="notification.actor.login" size="xs" />
        <span class="text-sm text-muted">Triggered by <span class="text-highlighted">{{ notification.actor.login }}</span></span>
      </div>
    </div>
  </div>
</template>
