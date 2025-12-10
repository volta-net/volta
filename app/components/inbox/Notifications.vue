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

// Stack of pending deletions (notifications to delete when their toast closes)
const pendingDeletes = ref<Notification[]>([])

// Set of pending delete IDs for quick lookup in template
const pendingDeleteIds = computed(() => new Set(pendingDeletes.value.map(n => n.id)))

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

// Delete notification (deferred until toast closes)
function deleteNotification() {
  if (!selectedNotification.value) return

  const notification = selectedNotification.value

  // Add to pending deletes stack
  pendingDeletes.value.push(notification)

  // Move selection to next notification (skip other pending deletes)
  const visibleNotifications = props.notifications.filter(n => !pendingDeleteIds.value.has(n.id))
  const index = visibleNotifications.findIndex(n => n.id === notification.id)
  if (index < visibleNotifications.length - 1) {
    selectedNotification.value = visibleNotifications[index + 1]
  } else if (index > 0) {
    selectedNotification.value = visibleNotifications[index - 1]
  } else {
    selectedNotification.value = null
  }

  // Show toast - actual deletion happens when toast closes
  toast.add({
    'id': `notification-deleted-${notification.id}`,
    'title': 'Notification deleted',
    'description': 'Press Z to undo',
    'icon': 'i-lucide-trash-2',
    'duration': 5000,
    'onUpdate:open': (open) => {
      if (!open) {
        executeDelete(notification)
      }
    }
  })
}

// Execute delete for a specific notification
async function executeDelete(notification: Notification) {
  // Check if still in pending (not undone)
  const index = pendingDeletes.value.findIndex(n => n.id === notification.id)
  if (index === -1) return

  // Delete from server first (keep hidden via pendingDeletes)
  await $fetch(`/api/notifications/${notification.id}`, {
    method: 'DELETE'
  })

  // Now remove from pending - notification is already deleted so no blink
  pendingDeletes.value.splice(index, 1)
  emit('refresh')
}

// Undo most recent delete
function undoDelete() {
  if (!pendingDeletes.value.length) return

  // Get most recent pending delete
  const notification = pendingDeletes.value.pop()!

  // Remove its toast
  toast.remove(`notification-deleted-${notification.id}`)
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

function getNotificationIcon(notification: Notification) {
  const { type, action } = notification

  // Release notifications
  if (type === 'release') {
    return 'i-octicon-tag-24'
  }

  // Workflow run notifications
  if (type === 'workflow_run') {
    if (action === 'failed') return 'i-octicon-x-circle-24'
    if (action === 'success') return 'i-octicon-check-circle-24'
    return 'i-octicon-play-24'
  }

  // Issue/PR - use existing logic
  const issue = notification.issue
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

function getNotificationColor(notification: Notification) {
  const { type, action } = notification

  // Release notifications
  if (type === 'release') {
    return 'text-emerald-400'
  }

  // Workflow run notifications
  if (type === 'workflow_run') {
    if (action === 'failed') return 'text-red-400'
    if (action === 'success') return 'text-emerald-400'
    return 'text-gray-400'
  }

  // Issue/PR - use existing logic
  const issue = notification.issue
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

function getNotificationTitle(notification: Notification) {
  const { type } = notification

  if (type === 'release' && notification.release) {
    return notification.release.name || notification.release.tagName
  }

  if (type === 'workflow_run' && notification.workflowRun) {
    return notification.workflowRun.name || notification.workflowRun.workflowName || 'Workflow'
  }

  return notification.issue?.title ?? 'Notification'
}

function getNotificationPrefix(notification: Notification) {
  const { type } = notification

  if (type === 'release' && notification.release) {
    return notification.release.tagName
  }

  if (type === 'workflow_run' && notification.workflowRun) {
    return notification.workflowRun.workflowName
  }

  if (notification.issue) {
    return `#${notification.issue.number}`
  }

  return null
}

function getActionLabel(action: Notification['action']) {
  switch (action) {
    case 'opened':
      return 'Opened'
    case 'reopened':
      return 'Reopened'
    case 'closed':
      return 'Closed'
    case 'merged':
      return 'Merged'
    case 'assigned':
      return 'Assigned'
    case 'mentioned':
      return 'Mentioned'
    case 'comment':
      return 'Commented'
    case 'review_requested':
      return 'Review requested'
    case 'review_submitted':
      return 'Reviewed'
    case 'review_dismissed':
      return 'Review dismissed'
    case 'ready_for_review':
      return 'Ready for review'
    case 'published':
      return 'Published'
    case 'failed':
      return 'Failed'
    case 'success':
      return 'Success'
    default:
      return null
  }
}

function getActionIcon(notification: Notification) {
  const { type, action } = notification

  // Release specific icons
  if (type === 'release') {
    return 'i-octicon-tag-16'
  }

  // Workflow run specific icons
  if (type === 'workflow_run') {
    if (action === 'failed') return 'i-octicon-x-circle-16'
    if (action === 'success') return 'i-octicon-check-circle-16'
    return 'i-octicon-play-16'
  }

  // Pull request specific icons
  if (type === 'pull_request') {
    switch (action) {
      case 'opened':
        return 'i-octicon-git-pull-request-16'
      case 'reopened':
        return 'i-octicon-git-pull-request-16'
      case 'closed':
        return 'i-octicon-git-pull-request-closed-16'
      case 'merged':
        return 'i-octicon-git-merge-16'
      case 'review_requested':
        return 'i-octicon-eye-16'
      case 'review_submitted':
        return 'i-octicon-check-circle-16'
      case 'review_dismissed':
        return 'i-octicon-x-16'
      case 'ready_for_review':
        return 'i-octicon-git-pull-request-16'
      case 'comment':
        return 'i-octicon-comment-16'
      case 'mentioned':
        return 'i-octicon-mention-16'
      case 'assigned':
        return 'i-octicon-person-16'
    }
  }

  // Issue specific icons
  if (type === 'issue') {
    switch (action) {
      case 'opened':
        return 'i-octicon-issue-opened-16'
      case 'reopened':
        return 'i-octicon-issue-reopened-16'
      case 'closed':
        return 'i-octicon-issue-closed-16'
      case 'comment':
        return 'i-octicon-comment-16'
      case 'mentioned':
        return 'i-octicon-mention-16'
      case 'assigned':
        return 'i-octicon-person-16'
    }
  }

  return 'i-octicon-bell-16'
}
</script>

<template>
  <div class="overflow-y-auto p-1 isolate">
    <template v-for="notification in notifications" :key="notification.id">
      <!-- Hide pending-deleted notifications -->
      <div
        v-if="!pendingDeleteIds.has(notification.id)"
        :ref="el => { notificationsRefs[notification.id] = el as Element }"
        class="relative p-3 text-sm cursor-default before:absolute before:z-[-1] before:inset-px before:rounded-md before:transition-colors transition-colors"
        :class="[
          selectedNotification?.id === notification.id ? 'text-highlighted before:bg-elevated' : 'text-default hover:text-highlighted hover:before:bg-elevated/50'
        ]"
        @click="selectedNotification = notification"
      >
        <!-- Title row -->
        <div class="flex items-center gap-2">
          <UIcon
            :name="getNotificationIcon(notification)"
            :class="getNotificationColor(notification)"
            class="size-4 shrink-0"
          />
          <p class="font-medium truncate flex-1" :class="[notification.read && 'opacity-70']">
            <template v-if="getNotificationPrefix(notification)">
              {{ getNotificationPrefix(notification) }}
            </template>
            {{ getNotificationTitle(notification) }}
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
  </div>
</template>
