<script setup lang="ts">
import type { Notification } from '#shared/types/notification'

defineProps<{
  notification: Notification
}>()
</script>

<template>
  <div class="flex-1 overflow-y-auto">
    <div class="p-4 space-y-6">
      <!-- Header -->
      <div class="flex items-start justify-between gap-4">
        <div class="flex items-center gap-3 min-w-0">
          <div class="flex items-center justify-center size-10 rounded-full bg-blue-500/10 shrink-0">
            <UIcon name="i-octicon-tag-16" class="size-5 text-blue-500" />
          </div>
          <div class="min-w-0">
            <h2 class="font-semibold text-highlighted truncate">
              {{ notification.release?.name || notification.release?.tagName }}
            </h2>
            <p class="text-sm text-muted">
              {{ notification.release?.tagName }}
            </p>
          </div>
        </div>

        <UButton
          v-if="notification.release?.htmlUrl"
          :to="notification.release.htmlUrl"
          target="_blank"
          color="neutral"
          variant="ghost"
          icon="i-lucide-external-link"
          size="sm"
        />
      </div>

      <!-- Repository info -->
      <div v-if="notification.repository" class="flex items-center gap-2 text-sm text-muted">
        <UIcon name="i-octicon-repo-16" class="size-4 shrink-0" />
        <span>{{ notification.repository.fullName }}</span>
      </div>

      <!-- Body/Description -->
      <div v-if="notification.body" class="prose prose-sm dark:prose-invert max-w-none">
        <p class="text-muted whitespace-pre-wrap">
          {{ notification.body }}
        </p>
      </div>
      <p v-else class="text-dimmed text-sm">
        No release notes available
      </p>

      <!-- Actor -->
      <div v-if="notification.actor" class="flex items-center gap-2 pt-4 border-t border-default">
        <UAvatar :src="notification.actor.avatarUrl" :alt="notification.actor.login" size="xs" />
        <span class="text-sm text-muted">Released by <span class="text-highlighted">{{ notification.actor.login }}</span></span>
      </div>
    </div>
  </div>
</template>
