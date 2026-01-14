<script setup lang="ts">
import type { Notification } from '#shared/types'

defineProps<{
  notification: Notification
  selected: boolean
}>()

const { getIcon, getColor, getTitle, getActionVerb, getSubjectLabel } = useNotificationHelpers()

function stripMarkdown(text: string | null | undefined): string {
  if (!text) return ''

  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]+`/g, '')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/^>\s+/gm, '')
    .replace(/^[\s]*[-*+]\s+/gm, '')
    .replace(/^[\s]*\d+\.\s+/gm, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
</script>

<template>
  <div
    class="relative flex items-center gap-2 px-3 py-2.5 text-sm cursor-default before:absolute before:z-[-1] before:inset-px before:rounded-md before:transition-colors transition-colors"
    :class="[
      selected ? 'before:bg-elevated' : 'hover:before:bg-elevated/50',
      notification.read && 'opacity-60'
    ]"
  >
    <!-- Avatar -->
    <UAvatar
      :src="notification.actor?.avatarUrl!"
      :alt="notification.actor?.login"
      size="lg"
      class="shrink-0"
    />

    <!-- Content -->
    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-1">
        <p class="font-medium truncate flex-1">
          {{ getTitle(notification) }}
        </p>
        <span v-if="!notification.read" class="size-2 rounded-full bg-primary shrink-0 m-1" />
        <UIcon
          :name="getIcon(notification)"
          :class="getColor(notification)"
          class="size-4 shrink-0"
        />
      </div>

      <div class="flex items-center gap-1 text-muted">
        <span class="truncate" :title="notification.body ?? undefined">
          <span v-if="notification.actor && notification.type !== 'workflow_run'" class="text-default">{{ notification.actor.login }}</span>
          {{ getActionVerb(notification) }}
          <template v-if="notification.action !== 'comment' && getSubjectLabel(notification.type)"> {{ getSubjectLabel(notification.type) }}</template>
          <template v-if="notification.repository"> in <span class="text-default hover:text-primary transition-colors">{{ notification.repository.fullName }}</span></template>
          <span v-if="notification.action === 'comment' && notification.body">: {{ stripMarkdown(notification.body) }}</span>
        </span>
        <span class="shrink-0 ms-auto flex items-center gap-1 text-sm text-dimmed">
          {{ useRelativeTime(new Date(notification.createdAt)) }}
        </span>
      </div>
    </div>
  </div>
</template>
