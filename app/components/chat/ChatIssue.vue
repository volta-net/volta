<script setup lang="ts">
import type { IssueStateLike } from '~/composables/useIssueState'

const props = defineProps<{
  number?: string | number | boolean
  repo?: string | boolean
  title?: string | boolean
  state?: string | boolean
  stateReason?: string | boolean
  type?: string | boolean
  draft?: string | boolean
  merged?: string | boolean
  comments?: string | number | boolean
  reactions?: string | number | boolean
  labels?: string | boolean
  author?: string | boolean
  url?: string | boolean
}>()

defineOptions({ inheritAttrs: false })

const { selectIssue } = useFavoriteIssues()

const isDraft = computed(() => props.draft === true || props.draft === 'true')
const isMerged = computed(() => props.merged === true || props.merged === 'true')
const commentCount = computed(() => Number(props.comments) || 0)
const reactionCount = computed(() => Number(props.reactions) || 0)
const labelList = computed(() => {
  if (!props.labels || typeof props.labels !== 'string') return []
  return props.labels.split(',').map((l) => {
    const trimmed = l.trim()
    const colonIdx = trimmed.lastIndexOf(':')
    if (colonIdx > 0 && trimmed.length - colonIdx - 1 >= 3) {
      return { name: trimmed.slice(0, colonIdx), color: trimmed.slice(colonIdx + 1) }
    }
    return { name: trimmed, color: '' }
  }).filter(l => l.name)
})

const stateLike = computed<IssueStateLike>(() => ({
  pullRequest: props.type === 'pr',
  state: typeof props.state === 'string' ? props.state : 'open',
  stateReason: typeof props.stateReason === 'string' ? props.stateReason : null,
  draft: isDraft.value,
  merged: isMerged.value
}))

const stateIcon = computed(() => getIssueStateIcon(stateLike.value))
const stateColor = computed(() => getIssueStateColor(stateLike.value))

function openIssue() {
  if (typeof props.repo !== 'string' || !props.number) return

  const [, name] = props.repo.split('/')

  selectIssue({
    id: 0,
    pullRequest: props.type === 'pr',
    number: Number(props.number),
    title: String(props.title || ''),
    state: String(props.state || 'open'),
    stateReason: typeof props.stateReason === 'string' ? props.stateReason : null,
    draft: isDraft.value || null,
    merged: isMerged.value || null,
    htmlUrl: typeof props.url === 'string' ? props.url : '',
    repository: { id: 0, name: name || '', fullName: props.repo }
  })

  navigateTo(props.type === 'pr' ? '/pulls' : '/issues')
}
</script>

<template>
  <button
    v-show="typeof title === 'string'"
    class="not-prose w-full flex items-start gap-2 px-3 py-2.5 rounded-lg border border-default bg-default hover:bg-elevated/50 transition-colors my-1 text-left cursor-pointer group"
    @click="openIssue"
  >
    <UIcon :name="stateIcon" :class="`text-${stateColor}`" class="size-4 shrink-0 mt-0.5" />

    <div class="min-w-0 flex-1 flex flex-col gap-1.5">
      <div class="flex items-center gap-1.5 justify-between">
        <p class="text-sm truncate">
          <span class="text-muted">{{ repo }}#{{ number }}</span>
          <span class="text-highlighted font-medium ml-1">{{ title }}</span>
        </p>

        <UIcon name="i-lucide-arrow-right" class="size-4 text-dimmed shrink-0 group-hover:translate-x-1 transition-transform duration-200" />
      </div>

      <div class="flex items-center gap-1.5 justify-between">
        <div v-if="labelList.length || author" class="flex items-center gap-1.5 flex-wrap">
          <IssueLabel
            v-for="label in labelList"
            :key="label.name"
            :label="label"
          />

          <UBadge
            v-if="typeof author === 'string'"
            :label="author"
            :avatar="{ src: `https://github.com/${author}.png`, alt: author }"
            class="rounded-full"
          />
        </div>

        <div class="flex items-center gap-1.5 flex-wrap">
          <UBadge
            v-if="reactionCount > 0"
            :label="reactionCount"
            icon="i-lucide-heart"
            variant="subtle"
            class="rounded-full"
          />

          <UBadge
            v-if="commentCount > 0"
            :label="commentCount"
            icon="i-lucide-message-square"
            variant="subtle"
            class="rounded-full"
          />
        </div>
      </div>
    </div>
  </button>
</template>
