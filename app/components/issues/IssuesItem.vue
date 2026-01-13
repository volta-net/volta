<script setup lang="ts">
const props = defineProps<{
  item: Issue
  selected?: boolean
}>()

const emit = defineEmits<{
  (e: 'select', item: Issue): void
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

// Resolution status config (issues only)
const { getConfig: getResolutionConfig } = useResolutionStatus()
const resolutionConfig = computed(() => {
  // Only show for issues, not PRs
  if (props.item.pullRequest) return null
  return getResolutionConfig(props.item.resolutionStatus)
})
</script>

<template>
  <button
    type="button"
    class="w-full flex flex-col gap-1 px-4 py-3 hover:bg-elevated/50 transition-colors text-left focus:outline-none"
    :class="[selected && 'bg-elevated']"
    @click="emit('select', item)"
  >
    <div class="flex items-center gap-3 min-w-0">
      <UIcon :name="stateIcon" :class="stateColor" class="size-4 shrink-0" />

      <div class="flex-1 flex items-center gap-3 min-w-0">
        <span class="text-sm font-medium truncate">
          <span class="text-dimmed">#{{ item.number }}</span> {{ item.title }}
        </span>
      </div>

      <!-- Maintainer replied (for issues) -->
      <UTooltip
        v-if="item.hasMaintainerComment"
        text="Maintainer replied"
      >
        <UIcon name="i-lucide-message-circle-reply" class="size-4 shrink-0 text-success" />
      </UTooltip>

      <!-- AI Resolution Status (for issues only) -->
      <UTooltip
        v-if="resolutionConfig"
        :text="String(resolutionConfig.label)"
      >
        <UIcon :name="resolutionConfig.icon" :class="resolutionConfig.color" class="size-4 shrink-0" />
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
        {{ useRelativeTime(new Date(item.updatedAt)) }}
      </span>
    </div>

    <div class="flex flex-wrap items-center gap-1">
      <IssueRepository :repository="item.repository" />
      <IssueUser v-if="item.user" :user="item.user" />
      <IssueType v-if="item.type" :type="item.type" />
      <IssueLabel v-for="label in item.labels" :key="label.id" :label="label" />
    </div>
  </button>
</template>
