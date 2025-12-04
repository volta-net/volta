<script setup lang="ts">
import type { Notification } from '~~/shared/types/notification'

const props = defineProps<{
  notifications: Notification[]
}>()

const notificationsRefs = ref<Record<string, Element>>({})

const selectedNotification = defineModel<Notification | null>()

watch(selectedNotification, () => {
  if (!selectedNotification.value) {
    return
  }
  const ref = notificationsRefs.value[selectedNotification.value.id]
  if (ref) {
    ref.scrollIntoView({ block: 'nearest' })
  }
})

defineShortcuts({
  arrowdown: () => {
    const index = props.notifications.findIndex(notification => notification.id === selectedNotification.value?.id)

    if (index === -1) {
      selectedNotification.value = props.notifications[0]
    } else if (index < props.notifications.length - 1) {
      selectedNotification.value = props.notifications[index + 1]
    }
  },
  arrowup: () => {
    const index = props.notifications.findIndex(notification => notification.id === selectedNotification.value?.id)

    if (index === -1) {
      selectedNotification.value = props.notifications[props.notifications.length - 1]
    } else if (index > 0) {
      selectedNotification.value = props.notifications[index - 1]
    }
  }
})

function getTypeIcon(type: Notification['type']) {
  switch (type) {
    case 'issue_opened':
    case 'issue_assigned':
    case 'issue_mentioned':
    case 'issue_comment':
      return 'i-lucide-circle-dot'
    case 'pr_review_requested':
    case 'pr_review_submitted':
    case 'pr_comment':
      return 'i-lucide-git-pull-request'
    case 'pr_merged':
      return 'i-lucide-git-merge'
    case 'pr_closed':
      return 'i-lucide-git-pull-request-closed'
    default:
      return 'i-lucide-bell'
  }
}

function getTypeColor(type: Notification['type']) {
  switch (type) {
    case 'issue_opened':
      return 'text-success'
    case 'pr_merged':
      return 'text-purple-500'
    case 'pr_closed':
      return 'text-error'
    default:
      return 'text-success'
  }
}

function getReasonLabel(type: Notification['type']) {
  switch (type) {
    case 'issue_opened':
      return 'Opened'
    case 'issue_assigned':
      return 'Assigned'
    case 'issue_mentioned':
      return 'Mentioned'
    case 'issue_comment':
      return 'Commented'
    case 'pr_review_requested':
      return 'Review Requested'
    case 'pr_review_submitted':
      return 'Reviewed'
    case 'pr_comment':
      return 'Commented'
    case 'pr_merged':
      return 'Merged'
    case 'pr_closed':
      return 'Closed'
    default:
      return null
  }
}

function getTitle(notification: Notification) {
  const issue = notification.issue
  if (!issue) return 'Notification'

  switch (notification.type) {
    case 'issue_opened':
      return issue.title
    case 'issue_assigned':
      return issue.title
    case 'issue_mentioned':
      return issue.title
    case 'issue_comment':
      return issue.title
    case 'pr_review_requested':
      return issue.title
    case 'pr_review_submitted':
      return issue.title
    case 'pr_comment':
      return issue.title
    case 'pr_merged':
      return issue.title
    case 'pr_closed':
      return issue.title
    default:
      return issue.title
  }
}
</script>

<template>
  <div class="overflow-y-auto p-1">
    <div
      v-for="notification in notifications"
      :key="notification.id"
      :ref="el => { notificationsRefs[notification.id] = el as Element }"
    >
      <div
        class="relative px-4 py-3 text-sm cursor-pointer before:absolute before:z-[-1] before:inset-px before:rounded-md before:transition-colors transition-colors"
        :class="[
          selectedNotification?.id === notification.id ? 'text-highlighted before:bg-elevated' : 'text-default hover:text-highlighted hover:before:bg-elevated/50'
        ]"
        @click="selectedNotification = notification"
      >
        <!-- Title row -->
        <div class="flex items-center gap-2">
          <UIcon
            :name="getTypeIcon(notification.type)"
            :class="getTypeColor(notification.type)"
            class="size-4 shrink-0"
          />
          <p class="font-medium truncate flex-1" :class="[notification.read && 'opacity-70']">
            <template v-if="notification.issue">
              #{{ notification.issue.number }}
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
            v-if="getReasonLabel(notification.type)"
            :label="getReasonLabel(notification.type)!"
            :icon="getTypeIcon(notification.type)"
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
    </div>
  </div>
</template>
