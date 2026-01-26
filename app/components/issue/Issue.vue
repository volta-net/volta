<script setup lang="ts">
import type { MentionUser } from '~/composables/useEditorMentions'
import type { AgentMode, LabelSuggestion } from '~/composables/useAgentActions'

const props = defineProps<{
  item: Issue
  onClose?: () => void
}>()

const emit = defineEmits<{
  (e: 'refresh'): void
}>()

const toast = useToast()

// Agent actions
const agent = useAgentActions(computed(() => issue.value))

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

// Refresh issue when window regains focus
const focused = useWindowFocus()
watch(focused, async (isFocused) => {
  if (isFocused && issue.value) {
    await refreshIssue()
  }
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
const { data: resolution, status: resolutionStatus, execute: fetchResolution, clear: clearResolution } = useLazyFetch<ResolutionData>(resolutionUrl, {
  immediate: false,
  watch: false
})

// Track if resolution is being analyzed
const analyzingResolution = computed(() => resolutionStatus.value === 'pending')

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

// Fetch repository collaborators for editor mentions
const collaboratorsUrl = computed(() => repoFullName.value ? `/api/repositories/${owner.value}/${name.value}/collaborators` : '')
const { data: collaborators } = await useLazyFetch<MentionUser[]>(collaboratorsUrl, {
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

// Favorite functionality - use shared composable
const { favorites: favoriteIssues, refresh: refreshFavorites } = useFavoriteIssues()

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

// Handle scrolling to answer comment from Meta
const timelineRef = ref<{ scrollToComment: (commentId: number) => void } | null>(null)

function scrollToAnswerComment(commentId: number) {
  timelineRef.value?.scrollToComment(commentId)
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

// Handle agent action confirmation
const applyingAgent = ref(false)

async function handleAgentConfirm(data: { mode: AgentMode, payload: unknown }) {
  if (!issue.value) return

  applyingAgent.value = true

  try {
    if (data.mode === 'labels') {
      const labels = data.payload as LabelSuggestion[]
      const toAdd = labels.filter(l => l.action === 'add')
      const toRemove = labels.filter(l => l.action === 'remove')

      // Add labels
      for (const label of toAdd) {
        await $fetch(`/api/repositories/${owner.value}/${name.value}/issues/${issue.value.number}/labels`, {
          method: 'POST',
          body: { labelId: label.id }
        })
      }

      // Remove labels
      for (const label of toRemove) {
        await $fetch(`/api/repositories/${owner.value}/${name.value}/issues/${issue.value.number}/labels/${label.id}`, {
          method: 'DELETE'
        })
      }

      // Build toast message
      const parts: string[] = []
      if (toAdd.length > 0) parts.push(`Added ${toAdd.length}`)
      if (toRemove.length > 0) parts.push(`Removed ${toRemove.length}`)

      toast.add({
        title: `${parts.join(', ')} label${labels.length > 1 ? 's' : ''}`,
        icon: 'i-lucide-check'
      })
      await handleRefresh()
    } else if (data.mode === 'title') {
      const newTitle = data.payload as string
      await $fetch(`/api/repositories/${owner.value}/${name.value}/issues/${issue.value.number}/title`, {
        method: 'PATCH',
        body: { title: newTitle }
      })
      toast.add({
        title: 'Title updated',
        icon: 'i-lucide-check'
      })
      await handleRefresh()
    }
    agent.close()
  } catch (err: any) {
    toast.add({
      title: 'Failed to apply suggestion',
      description: err.data?.message || err.message,
      color: 'error',
      icon: 'i-lucide-x'
    })
  } finally {
    applyingAgent.value = false
  }
}

// Agent dropdown items
const agentItems = computed(() => {
  const baseItems = [
    {
      label: 'Suggest title',
      icon: 'i-lucide-heading',
      onSelect: () => agent.suggest('title')
    },
    {
      label: 'Suggest labels',
      icon: 'i-lucide-tag',
      onSelect: () => agent.suggest('labels')
    }
  ]

  // Add find duplicates only for issues (not PRs)
  if (!props.item.pullRequest) {
    return [
      baseItems,
      [{
        label: 'Find duplicates',
        icon: 'i-lucide-copy',
        onSelect: () => agent.suggest('duplicates')
      }]
    ]
  }

  return [baseItems]
})
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden">
    <UDashboardNavbar :ui="{ left: 'gap-0.5', toggle: 'hidden' }">
      <template v-if="item.repository" #leading>
        <UButton
          :avatar="{ src: `https://github.com/${item.repository.fullName.split('/')[0]}.png`, alt: item.repository.fullName }"
          :to="item.repository.htmlUrl!"
          target="_blank"
          variant="ghost"
          class="text-sm/4 text-highlighted px-2 min-w-0"
        >
          <span class="truncate">
            <span class="hidden lg:inline">{{ item.repository.fullName.split('/')[0] }}/</span>{{ item.repository.name }}
          </span>
        </UButton>

        <UIcon name="i-lucide-chevron-right" class="size-4 text-muted shrink-0" />
      </template>

      <template #title>
        <UTooltip text="Open on GitHub" :kbds="['meta', 'g']">
          <UButton
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
            variant="ghost"
            :loading="syncing"
            @click="handleSync"
          />
        </UTooltip>
      </template>

      <template #right>
        <UDropdownMenu
          :items="agentItems"
          :content="{ align: 'end' }"
        >
          <UButton
            icon="i-lucide-sparkles"
            variant="soft"
            label="Ask AI"
            :loading="agent.isLoading.value"
          />
        </UDropdownMenu>

        <UButton
          :icon="isSubscribed ? 'i-lucide-bell-off' : 'i-lucide-bell'"
          :label="isSubscribed ? 'Unsubscribe' : 'Subscribe'"
          variant="soft"
          square
          class="hidden lg:inline-flex"
          @click="toggleSubscription"
        />

        <slot name="right" />

        <UButton
          v-if="onClose"
          icon="i-lucide-x"
          variant="soft"
          @click="onClose"
        />
      </template>
    </UDashboardNavbar>

    <!-- Loading state (only on initial load, not refetches) -->
    <AppLoading v-if="status === 'pending' && !issue" />

    <!-- Issue/PR View -->
    <div v-else-if="issue" class="flex flex-col lg:grid lg:grid-cols-3 flex-1 min-h-0 overflow-y-auto lg:overflow-hidden">
      <div class="border-b lg:border-b-0 lg:border-l border-default lg:order-last lg:overflow-y-auto p-4 sm:px-6">
        <IssueMeta
          :issue="issue"
          :analyzing-resolution="analyzingResolution"
          @refresh="handleRefresh"
          @scroll-to-answer="scrollToAnswerComment"
        />
      </div>

      <div :key="issue.id" class="flex-1 lg:overflow-y-auto p-4 sm:px-6 flex flex-col gap-4 lg:col-span-2 pb-22">
        <IssueTitle :issue="issue" @update:title="handleRefresh" />

        <IssueBody
          :issue="issue"
          :collaborators="collaborators"
          @refresh="handleRefresh"
        />

        <IssueTimeline
          ref="timelineRef"
          :issue="issue"
          :collaborators="collaborators"
          @refresh="handleRefresh"
        />
      </div>
    </div>

    <!-- Fallback if issue couldn't be loaded -->
    <div v-else class="flex-1 flex items-center justify-center">
      <p class="text-dimmed text-sm">
        Failed to load issue details
      </p>
    </div>

    <!-- Agent Action Modal -->
    <AgentActionModal
      v-model:open="agent.isOpen.value"
      :mode="agent.mode.value"
      :result="agent.result.value"
      :loading="agent.isLoading.value"
      :applying="applyingAgent"
      :error="agent.error.value"
      @confirm="handleAgentConfirm"
      @close="agent.close"
    />
  </div>
</template>
