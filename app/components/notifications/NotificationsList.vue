<script setup lang="ts">
import type { Notification } from '#shared/types/notification'

const props = defineProps<{
  notifications: Notification[]
}>()

const emit = defineEmits<{
  refresh: []
}>()

const toast = useToast()
const notificationsRefs = ref<Record<string, Element>>({})
const selectedNotification = defineModel<Notification | null>()

// Undo state
const deletedNotification = ref<Notification | null>(null)
const undoTimeout = ref<ReturnType<typeof setTimeout> | null>(null)

watch(selectedNotification, () => {
  if (!selectedNotification.value) {
    return
  }
  const ref = notificationsRefs.value[selectedNotification.value.id]
  if (ref) {
    ref.scrollIntoView({ block: 'nearest' })
  }
})

// Keep selectedNotification in sync with notifications array after refresh
watch(() => props.notifications, (newNotifications) => {
  if (selectedNotification.value) {
    const updated = newNotifications.find(n => n.id === selectedNotification.value!.id)
    if (updated) {
      selectedNotification.value = updated
    }
  }
}, { deep: true })

// Toggle read/unread
async function toggleRead() {
  if (!selectedNotification.value) return

  const notification = selectedNotification.value
  const newReadState = !notification.read

  // Optimistic update
  notification.read = newReadState

  await $fetch(`/api/notifications/${notification.id}`, {
    method: 'PATCH',
    body: { read: newReadState }
  })
  emit('refresh')
}

// Delete notification
async function deleteNotification() {
  if (!selectedNotification.value) return

  const notification = selectedNotification.value

  // Store for undo
  deletedNotification.value = notification

  // Clear any existing undo timeout
  if (undoTimeout.value) {
    clearTimeout(undoTimeout.value)
  }

  // Move selection to next notification before deleting
  const index = props.notifications.findIndex(n => n.id === notification.id)
  if (index < props.notifications.length - 1) {
    selectedNotification.value = props.notifications[index + 1]
  } else if (index > 0) {
    selectedNotification.value = props.notifications[index - 1]
  } else {
    selectedNotification.value = null
  }

  // Delete from server
  await $fetch(`/api/notifications/${notification.id}`, { method: 'DELETE' })
  emit('refresh')

  // Show toast
  toast.add({
    title: 'Notification deleted',
    description: 'Press Z to undo',
    icon: 'i-lucide-trash-2',
    duration: 5000
  })

  // Clear undo state after 5 seconds
  undoTimeout.value = setTimeout(() => {
    deletedNotification.value = null
    undoTimeout.value = null
  }, 5000)
}

// Undo delete
async function undoDelete() {
  if (!deletedNotification.value) return

  const notification = deletedNotification.value

  // Clear timeout
  if (undoTimeout.value) {
    clearTimeout(undoTimeout.value)
    undoTimeout.value = null
  }

  // Recreate notification on server
  await $fetch('/api/notifications', {
    method: 'POST',
    body: {
      type: notification.type,
      body: notification.body,
      repositoryId: notification.repositoryId,
      issueId: notification.issueId,
      actorId: notification.actorId,
      read: notification.read
    }
  })

  deletedNotification.value = null
  emit('refresh')

  toast.add({
    title: 'Notification restored',
    icon: 'i-lucide-undo-2',
    duration: 2000
  })
}

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
  },
  u: toggleRead,
  d: deleteNotification,
  z: undoDelete
})

// Icons based on issue/PR state (using octicon icons)
const issueStateIcons: Record<string, string> = {
  // Issues (state_reason: completed, not_planned, duplicate, reopened, null)
  open: 'i-octicon-issue-opened-24',
  completed: 'i-octicon-issue-closed-24',
  not_planned: 'i-octicon-skip-24',
  duplicate: 'i-octicon-duplicate-24',
  reopened: 'i-octicon-issue-reopened-24',
  // Pull Requests
  draft: 'i-octicon-git-pull-request-draft-24',
  merged: 'i-octicon-git-merge-24',
  open_pr: 'i-octicon-git-pull-request-24',
  closed_pr: 'i-octicon-git-pull-request-closed-24'
}

// Colors based on issue/PR state
const issueStateColors: Record<string, string> = {
  // Issues (state_reason: completed, not_planned, duplicate, reopened, null)
  open: 'text-emerald-400',
  completed: 'text-purple-400',
  not_planned: 'text-gray-400',
  duplicate: 'text-gray-400',
  reopened: 'text-emerald-400',
  // Pull Requests
  draft: 'text-gray-400',
  merged: 'text-purple-400',
  open_pr: 'text-emerald-400',
  closed_pr: 'text-red-400'
}

function getIssueIcon(issue: Notification['issue']) {
  if (!issue) return 'i-octicon-bell-24'

  if (issue.type === 'pull_request') {
    if (issue.draft) return issueStateIcons.draft
    if (issue.merged) return issueStateIcons.merged
    if (issue.state === 'closed') return issueStateIcons.closed_pr
    return issueStateIcons.open_pr
  }

  // Issue - use stateReason directly
  if (issue.state === 'open') return issueStateIcons.open
  return issueStateIcons[issue.stateReason || 'completed'] || issueStateIcons.completed
}

function getIssueColor(issue: Notification['issue']) {
  if (!issue) return 'text-muted'

  if (issue.type === 'pull_request') {
    if (issue.draft) return issueStateColors.draft
    if (issue.merged) return issueStateColors.merged
    if (issue.state === 'closed') return issueStateColors.closed_pr
    return issueStateColors.open_pr
  }

  // Issue - use stateReason directly
  if (issue.state === 'open') return issueStateColors.open
  return issueStateColors[issue.stateReason || 'completed'] || issueStateColors.completed
}

function getReasonLabel(type: Notification['type']) {
  switch (type) {
    case 'issue_opened':
    case 'pr_opened':
      return 'Opened'
    case 'issue_reopened':
    case 'pr_reopened':
      return 'Reopened'
    case 'issue_closed':
    case 'pr_closed':
      return 'Closed'
    case 'issue_assigned':
      return 'Assigned'
    case 'issue_mentioned':
      return 'Mentioned'
    case 'issue_comment':
    case 'pr_comment':
      return 'Commented'
    case 'pr_review_requested':
      return 'Review requested'
    case 'pr_review_submitted':
      return 'Reviewed'
    case 'pr_merged':
      return 'Merged'
    default:
      return null
  }
}

function getReasonIcon(type: Notification['type']) {
  switch (type) {
    case 'issue_opened':
      return 'i-octicon-issue-opened-16'
    case 'issue_reopened':
      return 'i-octicon-issue-reopened-16'
    case 'issue_closed':
      return 'i-octicon-issue-closed-16'
    case 'issue_assigned':
      return 'i-octicon-person-16'
    case 'issue_mentioned':
      return 'i-octicon-mention-16'
    case 'issue_comment':
    case 'pr_comment':
      return 'i-octicon-comment-16'
    case 'pr_opened':
      return 'i-octicon-git-pull-request-16'
    case 'pr_reopened':
      return 'i-octicon-git-pull-request-16'
    case 'pr_review_requested':
      return 'i-octicon-eye-16'
    case 'pr_review_submitted':
      return 'i-octicon-check-circle-16'
    case 'pr_merged':
      return 'i-octicon-git-merge-16'
    case 'pr_closed':
      return 'i-octicon-git-pull-request-closed-16'
    default:
      return 'i-octicon-bell-16'
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
            :name="getIssueIcon(notification.issue)"
            :class="getIssueColor(notification.issue)"
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
            :icon="getReasonIcon(notification.type)"
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
