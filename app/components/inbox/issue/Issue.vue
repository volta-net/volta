<script setup lang="ts">
import type { Notification } from '#shared/types/notification'
import type { Issue } from '#shared/types/issue'

const props = defineProps<{
  notification: Notification
}>()

const emit = defineEmits<{
  (e: 'refresh'): void
}>()

const toast = useToast()

// Fetch full issue details (includes isSubscribed)
const { data: issue, status, refresh: refreshIssue } = await useLazyFetch<Issue & { isSubscribed: boolean }>(() =>
  props.notification.issue?.id ? `/api/issues/${props.notification.issue.id}` : null as unknown as string, {
  watch: [() => props.notification.issue?.id],
  immediate: !!props.notification.issue?.id
})

// Local subscription state (initialized from issue, updated on toggle)
const isSubscribed = ref(false)
watch(() => issue.value?.isSubscribed, (val) => {
  isSubscribed.value = !!val
}, { immediate: true })

async function toggleSubscription() {
  if (!issue.value) return
  try {
    if (isSubscribed.value) {
      await $fetch(`/api/issues/${issue.value.id}/subscription`, { method: 'DELETE' })
      isSubscribed.value = false
      toast.add({ title: 'Unsubscribed from issue', icon: 'i-lucide-bell-off' })
    } else {
      await $fetch(`/api/issues/${issue.value.id}/subscription`, { method: 'POST' })
      isSubscribed.value = true
      toast.add({ title: 'Subscribed to issue', icon: 'i-lucide-bell' })
    }
  } catch (err: any) {
    toast.add({ title: 'Failed to update subscription', description: err.message, color: 'error', icon: 'i-lucide-x' })
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
  <UDashboardNavbar :ui="{ title: 'text-sm font-semibold' }">
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

    <template #title>
      #{{ notification.issue?.number }}
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
    <div class="flex-1 overflow-y-auto p-4">
      <div class="space-y-6">
        <!-- Header -->
        <InboxIssueHeader
          :issue="issue"
          @update:title="handleRefresh"
        />

        <!-- Labels -->
        <InboxIssueLabels :issue="issue" @refresh="handleRefresh" />

        <!-- Meta (Assignees, PR stats, Reviewers) -->
        <InboxIssueMeta :issue="issue" />

        <!-- Body -->
        <InboxIssueBody :issue="issue" @refresh="handleRefresh" />

        <!-- Activity Timeline -->
        <InboxIssueTimeline :issue="issue" />

        <!-- Add Comment -->
        <InboxIssueCommentForm :issue="issue" @refresh="handleRefresh" />
      </div>
    </div>
  </template>

  <!-- Fallback if issue couldn't be loaded -->
  <div v-else class="flex-1 flex items-center justify-center">
    <p class="text-dimmed text-sm">
      Failed to load issue details
    </p>
  </div>
</template>
