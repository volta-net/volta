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
const ciStatusConfig = computed(() => getAggregatedCIStatus(props.item.ciStatuses))

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
    class="w-full flex items-center gap-1.5 px-4 py-2.5 transition-colors text-left focus:outline-none @container"
    :class="[selected ? 'bg-elevated/50' : 'hover:bg-elevated/50']"
    @click="emit('select', item)"
  >
    <div class="flex items-center gap-1.5 min-w-0 flex-1">
      <UIcon :name="stateIcon" :class="stateColor" class="size-4 shrink-0" />

      <span class="text-sm/6 truncate @max-3xl:flex-1">
        <span class="text-muted">{{ item.repository?.fullName }}#{{ item.number }}</span> <span class="text-highlighted font-medium">{{ item.title }}</span>
      </span>

      <!-- CI Status -->
      <UTooltip
        v-if="ciStatusConfig"
        :text="ciStatusConfig.label"
      >
        <UIcon
          :name="ciStatusConfig.icon"
          :class="[ciStatusConfig.color, ciStatusConfig.animate && 'animate-pulse']"
          class="size-4 shrink-0"
        />
      </UTooltip>

      <!-- Maintainer replied (for issues) -->
      <UTooltip
        v-if="item.hasMaintainerComment"
        text="Maintainer replied"
      >
        <UIcon name="i-lucide-message-circle-reply" class="size-4 shrink-0 text-primary" />
      </UTooltip>

      <!-- AI Resolution Status (for issues only) -->
      <UTooltip
        v-if="resolutionConfig"
        :text="String(resolutionConfig.label)"
      >
        <UIcon
          :name="resolutionConfig.icon"
          :class="`text-${resolutionConfig.color}`"
          class="size-4 shrink-0"
        />
      </UTooltip>
    </div>

    <div class="flex items-center gap-1.5 ms-auto">
      <div class="hidden @3xl:flex items-center gap-1.5">
        <!-- Linked PRs (for issues) -->
        <UTooltip
          v-if="item.linkedPrs?.length"
          :text="`${item.linkedPrs.length} linked PR${item.linkedPrs.length > 1 ? 's' : ''}`"
        >
          <UBadge
            :label="item.linkedPrs.length"
            icon="i-lucide-git-pull-request"
            class="rounded-full"
          />
        </UTooltip>

        <UBadge
          v-if="(item.reactionCount ?? 0) > 0"
          :label="item.reactionCount ?? 0"
          icon="i-lucide-heart"
          class="rounded-full"
        />
        <UBadge
          v-if="(item.commentCount ?? 0) > 0"
          :label="item.commentCount ?? 0"
          icon="i-lucide-message-circle"
          class="rounded-full"
        />

        <IssueType v-if="item.type" :type="item.type" />
        <IssueLabel v-for="label in item.labels" :key="label.id" :label="label" />
      </div>

      <!-- Time -->
      <span class="text-xs text-muted shrink-0 text-end w-6">
        {{ useRelativeTime(new Date(item.updatedAt)) }}
      </span>
    </div>
  </button>
</template>
