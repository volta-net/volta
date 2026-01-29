<script setup lang="ts">
import type { Notification } from '#shared/types'

defineProps<{
  notification: Notification
  selected: boolean
}>()

const { getIcon, getColor, getPrefix, getTitle, getActionLabel, getActionIcon } = useNotificationHelpers()
</script>

<template>
  <div
    class="relative px-3 py-2.5 text-sm cursor-default before:absolute before:z-[-1] before:inset-px before:rounded-md before:transition-colors transition-colors"
    :class="[
      selected ? 'before:bg-elevated' : 'hover:before:bg-elevated/50'
    ]"
  >
    <div class="flex-1 flex flex-col gap-1.5 min-w-0">
      <div class="flex items-center gap-1.5" :class="{ 'opacity-70': notification.read }">
        <UIcon :name="getIcon(notification)" :class="`text-${getColor(notification)}`" class="size-4 shrink-0" />
        <p class="truncate flex-1 text-highlighted" :class="{ 'font-medium': !notification.read }">
          {{ getPrefix(notification) }}
          {{ getTitle(notification) }}
        </p>
        <span v-if="!notification.read" class="size-2 rounded-full bg-primary shrink-0 m-1" />
      </div>

      <div class="flex items-start gap-1.5" :class="{ 'opacity-60': notification.read }">
        <div class="flex flex-wrap items-center gap-1">
          <UButton
            v-if="notification.actor"
            :label="notification.actor.login"
            :avatar="{
              src: notification.actor.avatarUrl!,
              alt: notification.actor.login,
              loading: 'lazy'
            }"
            variant="outline"
            size="xs"
            class="border border-dashed border-accented ring-0"
          />
          <UButton
            :label="getActionLabel(notification)"
            :icon="getActionIcon(notification)"
            variant="outline"
            size="xs"
            class="border border-dashed border-accented ring-0"
          />
          <UButton
            v-if="notification.repository"
            :label="notification.repository.name"
            :avatar="{
              src: `https://github.com/${notification.repository.fullName.split('/')[0]}.png`,
              alt: notification.repository.fullName,
              loading: 'lazy'
            }"
            variant="outline"
            size="xs"
            class="border border-dashed border-accented ring-0"
          />
        </div>

        <span class="shrink-0 ms-auto text-sm/6.5 text-dimmed">
          {{ useRelativeTime(new Date(notification.createdAt)) }}
        </span>
      </div>
    </div>
  </div>
</template>
