<script setup lang="ts">
import type { IssueListItem } from '#shared/types/issue'

const props = defineProps<{
  item: IssueListItem
  showAuthor?: boolean
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

const authorLogin = computed(() => props.item.user?.login)

const ciStatusConfig = computed(() => {
  const ciStatus = props.item.ciStatus
  if (!ciStatus) return null

  const status = ciStatus.status
  const conclusion = ciStatus.conclusion

  if (status === 'in_progress' || status === 'queued') {
    return { icon: 'i-lucide-loader-2', color: 'text-yellow-500', label: 'Running', animate: true }
  }

  switch (conclusion) {
    case 'success':
      return { icon: 'i-lucide-check-circle', color: 'text-emerald-500', label: 'Passed', animate: false }
    case 'failure':
      return { icon: 'i-lucide-x-circle', color: 'text-red-500', label: 'Failed', animate: false }
    case 'cancelled':
      return { icon: 'i-lucide-circle-slash', color: 'text-neutral-500', label: 'Cancelled', animate: false }
    case 'skipped':
      return { icon: 'i-lucide-circle-minus', color: 'text-neutral-500', label: 'Skipped', animate: false }
    default:
      return { icon: 'i-lucide-circle-help', color: 'text-neutral-500', label: 'Unknown', animate: false }
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
    :to="item.htmlUrl || '#'"
    target="_blank"
    class="flex items-center gap-3 px-4 py-2.5 hover:bg-elevated/50 transition-colors border-b border-default last:border-b-0"
  >
    <!-- State icon -->
    <UIcon :name="stateIcon" :class="stateColor" class="size-4 shrink-0" />

    <!-- Content -->
    <div class="flex-1 flex items-center gap-3 min-w-0">
      <div class="flex items-center gap-2">
        <span class="text-sm font-medium truncate">#{{ item.number }} {{ item.title }}</span>
      </div>

      <div class="flex items-center gap-2 mt-0.5 text-xs text-muted">
        <!-- Type Badge -->
        <UBadge
          v-if="item.type"
          :label="item.type.name"
          :style="item.type.color ? { backgroundColor: `#${item.type.color}20`, color: `#${item.type.color}` } : {}"
          variant="subtle"
          size="xs"
          class="shrink-0"
        />

        <!-- Labels -->
        <div v-if="item.labels.length" class="flex items-center gap-1 shrink-0">
          <IssueLabel v-for="label in item.labels" :key="label.id" :label="label" />
        </div>
      </div>

      <div class="flex items-center gap-2 mt-0.5 text-xs text-muted">
        <span>{{ item.repository.fullName }}</span>
        <template v-if="showAuthor && authorLogin">
          <span>·</span>
          <span>{{ authorLogin }}</span>
        </template>
        <template v-if="(item.reactionCount ?? 0) > 0 || (item.commentCount ?? 0) > 0">
          <span>·</span>
          <span v-if="(item.reactionCount ?? 0) > 0" class="flex items-center gap-0.5">
            <UIcon name="i-lucide-heart" class="size-3" />
            {{ item.reactionCount }}
          </span>
          <span v-if="(item.commentCount ?? 0) > 0" class="flex items-center gap-0.5">
            <UIcon name="i-lucide-message-circle" class="size-3" />
            {{ item.commentCount }}
          </span>
        </template>
      </div>
    </div>

    <!-- AI Analysis Status (issues only) -->
    <UTooltip v-if="item.analyzing" text="Analyzing...">
      <UIcon name="i-lucide-sparkles" class="size-4 shrink-0 text-amber-500 animate-pulse" />
    </UTooltip>
    <UTooltip v-else-if="item.answered" text="AI confirmed answered">
      <UIcon name="i-lucide-sparkles" class="size-4 shrink-0 text-emerald-500" />
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
    <span class="text-xs text-muted shrink-0">
      {{ formatTimeAgo(item.updatedAt) }}
    </span>
  </NuxtLink>
</template>
