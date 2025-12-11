<script setup lang="ts">
import type { Notification } from '#shared/types/notification'

defineProps<{
  notification: Notification
}>()
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
      {{ notification.release?.name || notification.release?.tagName }}
    </template>
    <template #right>
      <UButton
        v-if="notification.release?.htmlUrl"
        icon="i-simple-icons-github"
        color="neutral"
        variant="ghost"
        size="sm"
        :to="notification.release.htmlUrl"
        target="_blank"
      />
    </template>
  </UDashboardNavbar>

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
              {{ notification.release?.tagName }}
            </h2>
            <p v-if="notification.release?.name && notification.release.name !== notification.release.tagName" class="text-sm text-muted">
              {{ notification.release.name }}
            </p>
          </div>
        </div>
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
