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

// Fetch full issue details
const { data: issue, status, refresh: refreshIssue } = await useFetch<Issue>(() =>
  props.notification.issue?.id ? `/api/issues/${props.notification.issue.id}` : null as unknown as string, {
  watch: [() => props.notification.issue?.id],
  immediate: !!props.notification.issue?.id
})

// Subscription management
const isSubscribed = ref(false)

async function checkSubscription() {
  if (!issue.value) return
  try {
    const data = await $fetch(`/api/issues/${issue.value.id}/subscription`)
    isSubscribed.value = !!data
  } catch {
    // Not subscribed
  }
}

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

// Watch for issue changes
watch(() => issue.value?.id, () => {
  checkSubscription()
}, { immediate: true })

// Handle refresh from child components
async function handleRefresh() {
  await refreshIssue()
  emit('refresh')
}
</script>

<template>
  <!-- Loading state -->
  <div v-if="status === 'pending'" class="flex-1 flex items-center justify-center">
    <UIcon name="i-lucide-loader-2" class="size-8 animate-spin text-muted" />
  </div>

  <!-- Issue/PR View -->
  <template v-else-if="issue">
    <div class="flex-1 overflow-y-auto">
      <div class="p-4 space-y-6">
        <!-- Header -->
        <InboxIssueHeader
          :issue="issue"
          :is-subscribed="isSubscribed"
          @update:title="handleRefresh"
          @toggle-subscription="toggleSubscription"
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
