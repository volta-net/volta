<script setup lang="ts">
import type { Notification } from '#shared/types/notification'

defineProps<{
  notification: Notification
  selected: boolean
}>()

const { getIcon, getColor, getTitle, getPrefix, getActionVerb, getSubjectLabel } = useNotificationHelpers()

function formatTimeAgo(date: Date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)

  if (seconds < 60) return 'now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`
  if (seconds < 2592000) return `${Math.floor(seconds / 604800)}w`
  return `${Math.floor(seconds / 2592000)}mo`
}

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
    class="relative flex items-center gap-2 px-2.5 py-2.5 text-sm cursor-default before:absolute before:z-[-1] before:inset-px before:rounded-md before:transition-colors transition-colors"
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
    <!-- <div v-else class="size-10 rounded-full bg-muted shrink-0" /> -->

    <!-- Content -->
    <div class="flex-1 min-w-0">
      <!-- First line: prefix + title ... state icon -->
      <div class="flex items-center gap-1">
        <p class="font-medium truncate flex-1">
          <span v-if="getPrefix(notification)">{{ getPrefix(notification) }}</span>
          {{ getTitle(notification) }}
        </p>
        <span v-if="!notification.read" class="size-2 rounded-full bg-primary shrink-0 m-1" />
        <UIcon
          :name="getIcon(notification)"
          :class="getColor(notification)"
          class="size-4 shrink-0"
        />
      </div>

      <!-- Second line: actor verb body ... repo · time -->
      <div class="flex items-center gap-1 mt-0.5 text-muted">
        <span class="truncate" :title="notification.body ?? undefined">
          <span v-if="notification.actor && notification.type !== 'workflow_run'" class="text-default">{{ notification.actor.login }}</span>
          {{ getActionVerb(notification) }}
          <template v-if="notification.action !== 'comment' && getSubjectLabel(notification.type)"> {{ getSubjectLabel(notification.type) }}</template>
          <template v-if="notification.repository"> in <span class="text-default hover:text-primary transition-colors">{{ notification.repository.fullName }}</span></template>
          <span v-if="notification.action === 'comment' && notification.body">: {{ stripMarkdown(notification.body) }}</span>
        </span>
        <span class="shrink-0 ms-auto flex items-center gap-1 text-sm text-dimmed">
          {{ formatTimeAgo(new Date(notification.createdAt)) }}
        </span>
      </div>
    </div>
  </div>
</template>
