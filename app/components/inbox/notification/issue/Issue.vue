<script setup lang="ts">
import type { Notification } from '#shared/types/notification'
import type { IssueDetail } from '#shared/types/issue'

const props = defineProps<{
  notification: Notification
}>()

const emit = defineEmits<{
  (e: 'refresh'): void
}>()

const toast = useToast()

// Fetch full issue details (includes isSubscribed)
const issueUrl = computed(() => {
  if (!props.notification.repository || !props.notification.issue?.number) return null
  const [owner, name] = props.notification.repository.fullName.split('/')
  return `/api/repositories/${owner}/${name}/issues/${props.notification.issue.number}`
})
const { data: issue, status, refresh: refreshIssue } = await useLazyFetch<IssueDetail & { isSubscribed: boolean }>(() =>
  issueUrl.value as string, {
  watch: [issueUrl],
  immediate: !!issueUrl.value
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
</script>

<template>
  <!-- Navbar -->
  <UDashboardNavbar :title="`#${notification.issue?.number}`" :ui="{ title: 'text-sm font-semibold' }">
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
  <template v-else-if="issue">
    <div class="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 flex flex-col gap-4">
      <InboxNotificationIssueTitle :issue="issue" @update:title="handleRefresh" />

      <!-- <InboxNotificationIssueLabels :issue="issue" @refresh="handleRefresh" /> -->

      <!-- <InboxNotificationIssueMeta :issue="issue" /> -->

      <InboxNotificationIssueBody :key="issue.id" :issue="issue" @refresh="handleRefresh" />

      <!-- <InboxNotificationIssueTimeline :issue="issue" /> -->

      <!-- <InboxNotificationIssueCommentForm :issue="issue" @refresh="handleRefresh" /> -->
    </div>
  </template>

  <!-- Fallback if issue couldn't be loaded -->
  <div v-else class="flex-1 flex items-center justify-center">
    <p class="text-dimmed text-sm">
      Failed to load issue details
    </p>
  </div>
</template>
