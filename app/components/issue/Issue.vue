<script setup lang="ts">
import type { Issue } from '#shared/types/issue'
import type { WorkflowConclusion } from '#shared/types/db'

const props = defineProps<{
  item: Issue
}>()

const issueState = computed(() => ({
  pullRequest: props.item.pullRequest ?? false,
  state: props.item.state,
  stateReason: props.item.stateReason ?? null,
  draft: props.item.draft ?? false,
  merged: props.item.merged ?? false
}))

const stateIcon = computed(() => getIssueStateIcon(issueState.value))
const stateColor = computed(() => getIssueStateColor(issueState.value))

// Aggregate CI statuses from all workflow runs
const ciStatusConfig = computed(() => {
  const statuses = props.item.ciStatuses
  if (!statuses || statuses.length === 0) return null

  const total = statuses.length

  // Count by status
  let inProgress = 0
  let passed = 0
  let failed = 0
  let failedRun = null as typeof statuses[0] | null

  for (const ci of statuses) {
    if (ci.status === 'in_progress' || ci.status === 'queued') {
      inProgress++
    } else if (ci.conclusion === 'success' || ci.conclusion === 'skipped') {
      passed++
    } else {
      failed++
      if (!failedRun) failedRun = ci
    }
  }

  // Determine aggregate conclusion for styling
  let aggregateConclusion: WorkflowConclusion | null = null
  if (inProgress > 0) {
    aggregateConclusion = null // Running
  } else if (failed > 0) {
    aggregateConclusion = 'failure'
  } else {
    aggregateConclusion = 'success'
  }

  const state = getCIState(aggregateConclusion)

  // Build label: "2 / 3 passed" or "Running 1 / 3"
  let label: string
  if (inProgress > 0) {
    label = `Running ${passed} / ${total}`
  } else {
    label = `${passed} / ${total} passed`
  }

  // Link to failed run if any, otherwise first run
  const representativeRun = failedRun || statuses[0]!

  return {
    icon: state.icon,
    color: state.color,
    label,
    animate: inProgress > 0,
    htmlUrl: representativeRun.htmlUrl
  }
})

function formatTimeAgo(date: Date | string) {
  const d = typeof date === 'string' ? new Date(date) : date
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000)

  if (seconds < 60) return 'now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`
  if (seconds < 2592000) return `${Math.floor(seconds / 604800)}w`
  return `${Math.floor(seconds / 2592000)}mo`
}
</script>

<template>
  <NuxtLink
    :to="item.htmlUrl ?? undefined"
    target="_blank"
    class="flex items-center gap-3 px-4 py-3 hover:bg-elevated/50 transition-colors"
  >
    <!-- State icon -->
    <UIcon :name="stateIcon" :class="stateColor" class="size-4 shrink-0" />

    <!-- Content -->
    <div class="flex-1 flex items-center gap-3 min-w-0">
      <span class="text-sm font-medium truncate">#{{ item.number }} {{ item.title }}</span>

      <div class="flex items-center gap-1 -my-1">
        <IssueType v-if="item.type" :type="item.type" />
        <IssueLabel v-for="label in item.labels" :key="label.id" :label="label" />
        <IssueRepository :repository="item.repository" />
        <IssueUser v-if="item.user" :user="item.user" />
      </div>

      <div class="flex items-center gap-2 text-xs text-muted" />
    </div>

    <!-- Maintainer replied (for issues) -->
    <UTooltip
      v-if="item.hasMaintainerComment"
      text="Maintainer replied"
    >
      <UIcon name="i-lucide-message-circle-reply" class="size-4 shrink-0 text-success" />
    </UTooltip>

    <span v-if="(item.reactionCount ?? 0) > 0" class="flex items-center gap-0.5 text-muted">
      <UIcon name="i-lucide-heart" class="size-4 shrink-0" />
      <span class="text-xs">{{ item.reactionCount }}</span>
    </span>

    <span v-if="(item.commentCount ?? 0) > 0" class="flex items-center gap-0.5 text-muted">
      <UIcon name="i-lucide-message-circle" class="size-4 shrink-0" />
      <span class="text-xs">{{ item.commentCount }}</span>
    </span>

    <!-- Linked PRs (for issues) -->
    <UTooltip
      v-if="item.linkedPrs?.length"
      :text="`${item.linkedPrs.length} linked PR${item.linkedPrs.length > 1 ? 's' : ''}`"
    >
      <div class="flex items-center gap-0.5 text-muted">
        <UIcon name="i-lucide-git-pull-request" class="size-4 shrink-0" />
        <span class="text-xs">{{ item.linkedPrs.length }}</span>
      </div>
    </UTooltip>

    <!-- CI Status -->
    <UTooltip
      v-if="ciStatusConfig"
      :text="ciStatusConfig.label"
    >
      <UIcon
        :name="ciStatusConfig.icon"
        :class="[ciStatusConfig.color, ciStatusConfig.animate && 'animate-spin']"
        class="size-4 shrink-0"
      />
    </UTooltip>

    <!-- Time -->
    <span class="text-xs text-muted shrink-0 w-8 text-end">
      {{ formatTimeAgo(item.updatedAt) }}
    </span>
  </NuxtLink>
</template>
