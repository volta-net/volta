<script setup lang="ts">
import type { Notification } from '#shared/types'

const props = defineProps<{
  notification: Notification
  onClose?: () => void
}>()

const emit = defineEmits<{
  (e: 'delete', id: number): void
}>()

defineShortcuts({
  meta_g: () => {
    if (props.notification.release?.htmlUrl) {
      window.open(props.notification.release.htmlUrl, '_blank')
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
          :label="notification.release?.name || notification.release?.tagName"
          :to="notification.release?.htmlUrl!"
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

  <div class="flex-1 overflow-y-auto">
    <div class="p-4 space-y-6">
      <!-- Header -->
      <div class="flex items-start justify-between gap-4">
        <div class="flex items-center gap-3 min-w-0">
          <div
            class="flex items-center justify-center size-10 rounded-full shrink-0"
            :class="getReleaseState(notification.release).color.replace('text-', 'bg-').replace('dark:', 'dark:bg-') + '/10'"
          >
            <UIcon :name="getReleaseState(notification.release).icon" class="size-5" :class="getReleaseState(notification.release).color" />
          </div>
          <div class="min-w-0">
            <h2 class="font-semibold text-highlighted truncate">
              {{ notification.release?.tagName }}
            </h2>
            <UBadge
              v-if="notification.release?.draft || notification.release?.prerelease"
              v-bind="getReleaseStateBadge(notification.release)"
              variant="subtle"
              class="mt-1"
            />
            <p v-else-if="notification.release?.name && notification.release.name !== notification.release.tagName" class="text-sm text-muted">
              {{ notification.release.name }}
            </p>
          </div>
        </div>
      </div>

      <!-- Body/Description -->
      <div v-if="notification.body">
        <p class="text-muted whitespace-pre-wrap">
          {{ notification.body }}
        </p>
      </div>
      <p v-else class="text-dimmed text-sm">
        No release notes available
      </p>

      <!-- Actor -->
      <div v-if="notification.actor" class="flex items-center gap-2 pt-4 border-t border-default">
        <UAvatar :src="notification.actor.avatarUrl!" :alt="notification.actor.login" size="xs" />
        <span class="text-sm text-muted">Released by <span class="text-highlighted">{{ notification.actor.login }}</span></span>
      </div>
    </div>
  </div>
</template>
