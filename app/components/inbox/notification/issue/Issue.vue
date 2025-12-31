<script setup lang="ts">
import type { Notification } from '#shared/types/notification'
import type { IssueDetail } from '#shared/types/issue'
import type { MentionUser } from '~/composables/useEditorMentions'

interface IssueReference {
  id: number
  number: number
  title: string
  state: string
  pullRequest: boolean
}

const props = defineProps<{
  notification: Notification
}>()

const emit = defineEmits<{
  (e: 'refresh'): void
}>()

const toast = useToast()

// Repository info (reactive)
const repoFullName = computed(() => props.notification.repository?.fullName)
const owner = computed(() => repoFullName.value?.split('/')[0])
const name = computed(() => repoFullName.value?.split('/')[1])

// Fetch full issue details
const issueUrl = computed(() => {
  if (!repoFullName.value || !props.notification.issue?.number) return ''
  return `/api/repositories/${owner.value}/${name.value}/issues/${props.notification.issue.number}`
})
const { data: issue, status, refresh: refreshIssue } = await useLazyFetch<IssueDetail & { isSubscribed: boolean }>(issueUrl, {
  immediate: !!issueUrl.value
})

// Fetch repository collaborators and issues for editor mentions
const collaboratorsUrl = computed(() => repoFullName.value ? `/api/repositories/${owner.value}/${name.value}/collaborators` : '')
const { data: collaborators } = await useLazyFetch<MentionUser[]>(collaboratorsUrl, {
  default: () => [],
  immediate: !!repoFullName.value
})
const issuesUrl = computed(() => repoFullName.value ? `/api/repositories/${owner.value}/${name.value}/issues` : '')
const { data: repositoryIssues } = await useLazyFetch<IssueReference[]>(issuesUrl, {
  default: () => [],
  immediate: !!repoFullName.value
})

// Refetch issue when notification prop changes (e.g., after inbox refresh)
watch(() => props.notification, () => {
  if (issueUrl.value) {
    refreshIssue()
  }
})

// Local subscription state (initialized from issue, updated on toggle)
const isSubscribed = ref(false)
watch(() => issue.value?.isSubscribed, (val) => {
  isSubscribed.value = !!val
}, { immediate: true })

async function toggleSubscription() {
  if (!issue.value || !issueUrl.value) return
  try {
    if (isSubscribed.value) {
      await $fetch(`${issueUrl.value}/subscription`, { method: 'DELETE' })
      isSubscribed.value = false
      toast.add({ title: 'Unsubscribed from issue', icon: 'i-lucide-bell-off' })
    } else {
      await $fetch(`${issueUrl.value}/subscription`, { method: 'POST' })
      isSubscribed.value = true
      toast.add({ title: 'Subscribed to issue', icon: 'i-lucide-bell' })
    }
  } catch (err: any) {
    toast.add({ title: 'Failed to update subscription', description: err.message, color: 'error', icon: 'i-lucide-x' })
  }
}

// Favorite functionality
const { data: favoriteIssues, refresh: refreshFavorites } = await useLazyFetch('/api/favorites/issues', {
  default: () => []
})

const isFavorited = computed(() => favoriteIssues.value?.some(f => f.issueId === issue.value?.id) || false)
const updatingFavorite = ref(false)

async function toggleFavorite() {
  if (!issue.value) return

  updatingFavorite.value = true

  try {
    if (isFavorited.value) {
      await $fetch(`/api/favorites/issues/${issue.value.id}`, { method: 'DELETE' })
      toast.add({ title: 'Removed from favorites', icon: 'i-lucide-star' })
    } else {
      await $fetch('/api/favorites/issues', {
        method: 'POST',
        body: { issueId: issue.value.id }
      })
      toast.add({ title: 'Added to favorites', icon: 'i-lucide-star' })
    }
    await refreshFavorites()
  } catch (error: any) {
    toast.add({
      title: 'Failed to update favorites',
      description: error.data?.message || 'An error occurred',
      color: 'error'
    })
  } finally {
    updatingFavorite.value = false
  }
}

// Handle refresh from child components
async function handleRefresh() {
  await refreshIssue()
  emit('refresh')
}

defineShortcuts({
  meta_g: () => {
    if (props.notification.issue?.htmlUrl) {
      window.open(props.notification.issue.htmlUrl, '_blank')
    }
  }
})
</script>

<template>
  <!-- Navbar -->
  <UDashboardNavbar :title="`#${notification.issue?.number}`" :ui="{ title: 'text-sm font-medium' }">
    <template v-if="notification.repository" #leading>
      <UButton
        :label="notification.repository.fullName"
        :avatar="{ src: `https://github.com/${notification.repository.fullName.split('/')[0]}.png`, alt: notification.repository.fullName }"
        :to="notification.repository.htmlUrl!"
        target="_blank"
        color="neutral"
        variant="ghost"
        class="text-sm/4 text-highlighted -mx-1.5"
        square
      />

      <UIcon name="i-lucide-chevron-right" class="size-4 text-muted" />
    </template>

    <template #trailing>
      <!-- Favorite button -->
      <UTooltip :text="isFavorited ? 'Remove from favorites' : 'Add to favorites'">
        <UButton
          :icon="isFavorited ? 'i-lucide-star' : 'i-lucide-star'"
          color="neutral"
          variant="ghost"
          :loading="updatingFavorite"
          :class="isFavorited ? 'text-warning' : 'text-muted'"
          @click="toggleFavorite"
        />
      </UTooltip>
    </template>

    <template #right>
      <UButton
        :icon="isSubscribed ? 'i-lucide-bell-off' : 'i-lucide-bell'"
        :label="isSubscribed ? 'Unsubscribe' : 'Subscribe'"
        color="neutral"
        variant="subtle"
        square
        @click="toggleSubscription"
      />

      <UTooltip text="Open on GitHub" :kbds="['meta', 'g']">
        <UButton
          v-if="notification.issue?.htmlUrl"
          icon="i-simple-icons-github"
          color="neutral"
          variant="subtle"
          :to="notification.issue.htmlUrl"
          target="_blank"
        />
      </UTooltip>
    </template>
  </UDashboardNavbar>

  <!-- Loading state (only on initial load, not refetches) -->
  <div v-if="status === 'pending' && !issue" class="flex-1 flex items-center justify-center">
    <UIcon name="i-lucide-loader-2" class="size-8 animate-spin text-muted" />
  </div>

  <!-- Issue/PR View -->
  <div v-else-if="issue" class="grid grid-cols-3 flex-1 min-h-0">
    <div class="flex-1 overflow-y-auto p-4 sm:px-6 flex flex-col gap-4 col-span-2">
      <InboxNotificationIssueTitle :issue="issue" @update:title="handleRefresh" />

      <InboxNotificationIssueBody
        :key="issue.id"
        :issue="issue"
        :collaborators="collaborators"
        :repository-issues="repositoryIssues"
        @refresh="handleRefresh"
      />

      <!-- <InboxNotificationIssueTimeline :issue="issue" /> -->

      <!-- <InboxNotificationIssueCommentForm :issue="issue" :collaborators="collaborators" :repository-issues="repositoryIssues" @refresh="handleRefresh" /> -->
    </div>

    <div class="border-l border-default overflow-y-auto p-4 sm:px-6">
      <InboxNotificationIssueMeta :issue="issue" @refresh="handleRefresh" />
    </div>
  </div>

  <!-- Fallback if issue couldn't be loaded -->
  <div v-else class="flex-1 flex items-center justify-center">
    <p class="text-dimmed text-sm">
      Failed to load issue details
    </p>
  </div>
</template>
