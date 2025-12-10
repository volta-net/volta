<script setup lang="ts">
import type { Notification } from '#shared/types/notification'

defineProps<{
  notification: Notification
  selected: boolean
}>()

const { getIcon, getColor, getTitle, getPrefix, getActionLabel, getActionIcon } = useNotificationHelpers()
</script>

<template>
  <div
    class="relative p-3 text-sm cursor-default before:absolute before:z-[-1] before:inset-px before:rounded-md before:transition-colors transition-colors"
    :class="[
      selected ? 'text-highlighted before:bg-elevated' : 'text-default hover:text-highlighted hover:before:bg-elevated/50'
    ]"
  >
    <!-- Title row -->
    <div class="flex items-center gap-2">
      <UIcon
        :name="getIcon(notification)"
        :class="getColor(notification)"
        class="size-4 shrink-0"
      />
      <p class="font-medium truncate flex-1" :class="[notification.read && 'opacity-70']">
        <template v-if="getPrefix(notification)">
          {{ getPrefix(notification) }}
        </template>
        {{ getTitle(notification) }}
      </p>
      <span v-if="!notification.read" class="w-2 h-2 rounded-full bg-info shrink-0" />
      <time class="text-xs text-muted shrink-0">
        {{ useTimeAgo(new Date(notification.createdAt)) }}
      </time>
    </div>

    <!-- Actor and badges row -->
    <div class="flex items-center gap-2 mt-2 ml-6">
      <UBadge
        v-if="notification.actor"
        :label="notification.actor.login"
        variant="outline"
        color="neutral"
        size="sm"
        :ui="{ base: 'gap-1.5' }"
      >
        <template #leading>
          <UAvatar
            v-if="notification.actor.avatarUrl"
            :src="notification.actor.avatarUrl"
            :alt="notification.actor.login"
            size="3xs"
          />
        </template>
      </UBadge>

      <UBadge
        v-if="getActionLabel(notification.action)"
        :label="getActionLabel(notification.action)!"
        :icon="getActionIcon(notification)"
        variant="outline"
        color="neutral"
        size="sm"
      />

      <UBadge
        v-if="notification.repository"
        :label="notification.repository.name"
        icon="i-simple-icons-github"
        variant="outline"
        color="neutral"
        size="sm"
      />
    </div>
  </div>
</template>
