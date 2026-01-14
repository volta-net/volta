<script setup lang="ts">
import type { MentionUser } from '~/composables/useEditorMentions'

interface IssueReference {
  id: number
  number: number
  title: string
  state: string
  pullRequest: boolean
}

const props = defineProps<{
  item: Issue
}>()

const emit = defineEmits<{
  (e: 'close' | 'refresh'): void
}>()

const toast = useToast()

// Repository info (reactive)
const repoFullName = computed(() => props.item.repository?.fullName)
const owner = computed(() => repoFullName.value?.split('/')[0])
const name = computed(() => repoFullName.value?.split('/')[1])

// Fetch full issue details
const issueUrl = computed(() => {
  if (!repoFullName.value || !props.item.number) return ''
  return `/api/repositories/${owner.value}/${name.value}/issues/${props.item.number}`
})
const { data: issue, status, refresh: refreshIssue } = await useLazyFetch<IssueDetail & { isSubscribed: boolean }>(issueUrl, {
  immediate: !!issueUrl.value
})

// Fetch AI resolution analysis for issues (not PRs)
const resolutionUrl = computed(() => {
  if (!issueUrl.value || props.item.pullRequest) return ''
  return `${issueUrl.value}/resolution`
})
interface ResolutionData {
  status: string | null
  answeredBy: { id: number, login: string, avatar: string | null } | null
  answerCommentId: number | null
  confidence: number | null
  analyzedAt: string | null
  skipped: boolean
}
const { data: resolution, execute: fetchResolution, clear: clearResolution } = useLazyFetch<ResolutionData>(resolutionUrl, {
  immediate: false,
  watch: false
})

// Reset resolution and fetch when issue changes (not a PR)
watch(() => props.item.id, () => {
  clearResolution()
  if (resolutionUrl.value) {
    fetchResolution()
  }
}, { immediate: true })

// Merge resolution data into issue when it arrives
watch(resolution, (res) => {
  if (res && issue.value && !res.skipped) {
    // Create new object to trigger reactivity for child components
    issue.value = {
      ...issue.value,
      resolutionStatus: res.status as IssueDetail['resolutionStatus'],
      resolutionAnsweredBy: res.answeredBy as IssueDetail['resolutionAnsweredBy'],
      resolutionAnswerCommentId: res.answerCommentId,
      resolutionConfidence: res.confidence,
      resolutionAnalyzedAt: res.analyzedAt
    }
  }
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

// Force sync with GitHub
const syncing = ref(false)
async function handleSync() {
  if (!issueUrl.value || syncing.value) return

  syncing.value = true
  try {
    await $fetch(`${issueUrl.value}/sync`, { method: 'POST' })
    await refreshIssue()

    // Re-analyze resolution after sync (for issues only)
    if (resolutionUrl.value) {
      await $fetch(resolutionUrl.value, { query: { force: true } })
      await fetchResolution()
    }

    emit('refresh')
    toast.add({ title: 'Synced with GitHub', icon: 'i-lucide-refresh-cw' })
  } catch (err: any) {
    toast.add({ title: 'Failed to sync', description: err.message, color: 'error', icon: 'i-lucide-x' })
  } finally {
    syncing.value = false
  }
}

defineShortcuts({
  meta_g: () => {
    if (props.item.htmlUrl) {
      window.open(props.item.htmlUrl, '_blank')
    }
  }
})
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden">
    <UDashboardNavbar :ui="{ left: 'gap-0.5' }">
      <template v-if="item.repository" #leading>
        <UButton
          :label="item.repository.fullName"
          :avatar="{ src: `https://github.com/${item.repository.fullName.split('/')[0]}.png`, alt: item.repository.fullName }"
          :to="item.repository.htmlUrl!"
          target="_blank"
          color="neutral"
          variant="ghost"
          class="text-sm/4 text-highlighted px-2"
        />

        <UIcon name="i-lucide-chevron-right" class="size-4 text-muted" />
      </template>

      <template #title>
        <UTooltip text="Open on GitHub" :kbds="['meta', 'g']">
          <UButton
            color="neutral"
            variant="ghost"
            :label="`#${item.number}`"
            :to="item.htmlUrl!"
            target="_blank"
            class="text-sm/4 text-highlighted px-2"
          />
        </UTooltip>
      </template>

      <template #trailing>
        <UTooltip :text="isFavorited ? 'Remove from favorites' : 'Add to favorites'">
          <UButton
            :icon="isFavorited ? 'i-lucide-star' : 'i-lucide-star'"
            color="neutral"
            active-color="warning"
            variant="ghost"
            :loading="updatingFavorite"
            :active="isFavorited"
            @click="toggleFavorite"
          />
        </UTooltip>

        <UTooltip text="Sync with GitHub">
          <UButton
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="ghost"
            :loading="syncing"
            @click="handleSync"
          />
        </UTooltip>
      </template>

      <template #right>
        <UButton
          :icon="isSubscribed ? 'i-lucide-bell-off' : 'i-lucide-bell'"
          :label="isSubscribed ? 'Unsubscribe' : 'Subscribe'"
          color="neutral"
          variant="soft"
          square
          @click="toggleSubscription"
        />

        <slot name="right" />
      </template>
    </UDashboardNavbar>

    <!-- Loading state (only on initial load, not refetches) -->
    <div v-if="status === 'pending' && !issue" class="flex-1 flex items-center justify-center">
      <UIcon name="i-lucide-loader-2" class="size-8 animate-spin text-muted" />
    </div>

    <!-- Issue/PR View -->
    <div v-else-if="issue" class="grid grid-cols-3 flex-1 min-h-0">
      <div :key="issue.id" class="flex-1 overflow-y-auto p-4 sm:px-6 flex flex-col gap-4 col-span-2">
        <IssueTitle :issue="issue" @update:title="handleRefresh" />

        <IssueBody
          :issue="issue"
          :collaborators="collaborators"
          :repository-issues="repositoryIssues"
          @refresh="handleRefresh"
        />

        <IssueTimeline
          :issue="issue"
          :collaborators="collaborators"
          :repository-issues="repositoryIssues"
          @refresh="handleRefresh"
        />
      </div>

      <div class="border-l border-default overflow-y-auto p-4 sm:px-6">
        <IssueMeta :issue="issue" @refresh="handleRefresh" />
      </div>
    </div>

    <!-- Fallback if issue couldn't be loaded -->
    <div v-else class="flex-1 flex items-center justify-center">
      <p class="text-dimmed text-sm">
        Failed to load issue details
      </p>
    </div>
  </div>
</template>
