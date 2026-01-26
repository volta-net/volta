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

// Review state (PRs only)
const reviewState = useReviewState(computed(() => props.item))

// Track container width to show tooltips only when labels are hidden (below @3xl: 896px)
const containerRef = ref<HTMLElement | null>(null)
const { width: containerWidth } = useElementSize(containerRef)
const showBadgeTooltips = computed(() => containerWidth.value < 768)
</script>

<template>
  <button
    ref="containerRef"
    type="button"
    class="w-full flex items-center gap-1.5 px-4 py-2.5 transition-colors text-left focus:outline-none @container"
    :class="[selected ? 'bg-elevated/50' : 'hover:bg-elevated/50']"
    @click="emit('select', item)"
  >
    <div class="flex items-center gap-1.5 min-w-0 flex-1">
      <UIcon :name="stateIcon" :class="`text-${stateColor}`" class="size-4 shrink-0" />

      <span class="text-sm/6 truncate @max-3xl:flex-1">
        <span class="text-muted">{{ item.repository?.fullName }}#{{ item.number }}</span> <span class="text-highlighted font-medium">{{ item.title }}</span>
      </span>

      <!-- Review state (for PRs) -->
      <UTooltip
        v-if="reviewState"
        :text="reviewState.label"
        :disabled="!showBadgeTooltips"
      >
        <UBadge
          :label="reviewState.label"
          variant="soft"
          :ui="{ label: 'hidden @3xl:block' }"
          class="rounded-full px-1 @3xl:px-2"
        >
          <template #leading>
            <UChip
              :color="reviewState.color"
              standalone
              inset
              size="md"
              class="p-1"
            />
          </template>
        </UBadge>
      </UTooltip>

      <!-- CI Status -->
      <UTooltip
        v-if="ciStatusConfig"
        :text="ciStatusConfig.label"
        :disabled="!showBadgeTooltips"
      >
        <UBadge
          :label="ciStatusConfig.label"
          :icon="ciStatusConfig.icon"
          variant="soft"
          :ui="{
            label: 'hidden @3xl:block',
            leadingIcon: [`text-${ciStatusConfig.color}`, ciStatusConfig.animate && 'animate-pulse']
          }"
          class="rounded-full px-1 @3xl:px-2"
        />
      </UTooltip>

      <!-- AI Resolution Status (for issues only) -->
      <UTooltip
        v-if="resolutionConfig"
        :text="String(resolutionConfig.label)"
        :disabled="!showBadgeTooltips"
      >
        <UBadge
          :label="resolutionConfig.label"
          :icon="resolutionConfig.icon"
          variant="soft"
          :ui="{
            label: 'hidden @3xl:block',
            leadingIcon: `text-${resolutionConfig.color}`
          }"
          class="rounded-full px-1 @3xl:px-2"
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
            variant="subtle"
            class="rounded-full"
          />
        </UTooltip>

        <!-- Comments -->
        <UTooltip
          text="Maintainer replied"
          :disabled="!item.hasMaintainerComment"
        >
          <UBadge
            v-if="(item.commentCount ?? 0) > 0"
            :label="item.commentCount ?? 0"
            icon="i-lucide-message-circle"
            :color="item.hasMaintainerComment ? 'primary' : 'neutral'"
            variant="subtle"
            class="rounded-full"
          />
        </UTooltip>

        <!-- Reactions -->
        <UBadge
          v-if="(item.reactionCount ?? 0) > 0"
          :label="item.reactionCount ?? 0"
          icon="i-lucide-heart"
          variant="subtle"
          class="rounded-full"
        />

        <IssueType v-if="item.type" :type="item.type" />
        <IssueLabel v-for="label in item.labels" :key="label.id" :label="label" />
        <IssueUser v-if="item.user" :user="item.user" />
      </div>

      <!-- Time -->
      <span class="text-xs text-muted shrink-0 text-end w-6">
        {{ useRelativeTime(new Date(item.updatedAt)) }}
      </span>
    </div>
  </button>
</template>
