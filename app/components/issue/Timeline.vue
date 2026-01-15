<script setup lang="ts">
import type { TimelineItem } from '@nuxt/ui'
import type { MentionUser } from '~/composables/useEditorMentions'
import type { IssueReviewComment } from '#shared/types'

const props = defineProps<{
  issue: IssueDetail
  collaborators?: MentionUser[]
  highlightedCommentId?: number | null
}>()

const emit = defineEmits<{
  (e: 'refresh'): void
}>()

// eslint-disable-next-line vue/no-dupe-keys
const highlightedCommentId = ref<number | null>(null)

// Watch for external highlight requests
watch(() => props.highlightedCommentId, (commentId) => {
  if (commentId) {
    scrollToComment(commentId)
  }
})

// Scroll to and highlight a comment
function scrollToComment(commentId: number) {
  const element = document.getElementById(`comment-${commentId}`)
  if (element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'center' })
    highlightedCommentId.value = commentId
    // Remove highlight after animation
    setTimeout(() => {
      highlightedCommentId.value = null
    }, 2000)
  }
}

// Expose scroll function for parent components
defineExpose({ scrollToComment })

const { user } = useUserSession()

interface ActivityItem extends TimelineItem {
  rawDate?: Date
  username?: string
  action?: string
  // Comment ID for scrolling/highlighting
  commentId?: number
  // For review comments (when not nested in a review)
  diffHunk?: string
  filePath?: string
  // For reviews with nested comments
  reviewComments?: IssueReviewComment[]
}

// Review state configuration
const reviewStateConfig: Record<string, { icon: string, action: string }> = {
  APPROVED: { icon: 'i-octicon-check-16', action: 'approved these changes' },
  CHANGES_REQUESTED: { icon: 'i-octicon-file-diff-16', action: 'requested changes' },
  COMMENTED: { icon: 'i-octicon-eye-16', action: 'reviewed' },
  DISMISSED: { icon: 'i-octicon-x-16', action: 'dismissed review' },
  PENDING: { icon: 'i-octicon-clock-16', action: 'started a review' }
}

// Helper to safely create a Date from any value
function toDate(value: unknown): Date | undefined {
  if (value === null || value === undefined) return undefined
  return value instanceof Date ? value : new Date(value as string | number)
}

const timelineItems = computed(() => {
  const items: ActivityItem[] = []

  // Build a map of reviewId -> review comments
  const reviewCommentsMap = new Map<number, IssueReviewComment[]>()
  const orphanReviewComments: IssueReviewComment[] = []

  props.issue.reviewComments?.forEach((comment) => {
    if (comment.review?.id) {
      const existing = reviewCommentsMap.get(comment.review.id) || []
      existing.push(comment)
      reviewCommentsMap.set(comment.review.id, existing)
    } else {
      orphanReviewComments.push(comment)
    }
  })

  // Comments
  props.issue.comments?.forEach((comment) => {
    items.push({
      username: comment.user?.login || 'Unknown',
      action: 'commented',
      description: comment.body,
      avatar: comment.user?.avatarUrl ? { src: comment.user.avatarUrl } : undefined,
      icon: 'i-octicon-comment-16',
      rawDate: toDate(comment.createdAt),
      commentId: comment.id
    })
  })

  // Reviews (PR only) with nested review comments
  props.issue.reviews?.forEach((review) => {
    const config = reviewStateConfig[review.state] ?? reviewStateConfig.COMMENTED!
    const nestedComments = reviewCommentsMap.get(review.id) || []

    items.push({
      username: review.user?.login || 'Unknown',
      action: config.action,
      description: review.body || undefined,
      avatar: review.user?.avatarUrl ? { src: review.user.avatarUrl } : undefined,
      icon: config.icon,
      rawDate: toDate(review.submittedAt) || toDate(review.createdAt),
      reviewComments: nestedComments.length > 0 ? nestedComments : undefined
    })
  })

  // Orphan review comments (no parent review - shouldn't happen but handle gracefully)
  orphanReviewComments.forEach((comment) => {
    items.push({
      username: comment.user?.login || 'Unknown',
      action: 'left a review comment',
      description: comment.body,
      avatar: comment.user?.avatarUrl ? { src: comment.user.avatarUrl } : undefined,
      icon: 'i-octicon-code-16',
      rawDate: toDate(comment.createdAt),
      diffHunk: comment.diffHunk || undefined,
      filePath: comment.path || undefined
    })
  })

  // Closed/Merged
  if (props.issue.closedAt) {
    const isMerged = props.issue.pullRequest && props.issue.merged
    const actor = isMerged ? props.issue.mergedBy : props.issue.closedBy

    items.push({
      username: actor?.login || 'Unknown',
      action: isMerged ? 'merged this pull request' : `closed this ${props.issue.pullRequest ? 'pull request' : 'issue'}`,
      avatar: actor?.avatarUrl ? { src: actor.avatarUrl } : undefined,
      icon: isMerged ? 'i-octicon-git-merge-16' : 'i-octicon-issue-closed-16',
      rawDate: toDate(props.issue.mergedAt) || toDate(props.issue.closedAt)
    })
  }

  // Sort by date
  items.sort((a, b) => (a.rawDate?.getTime() || 0) - (b.rawDate?.getTime() || 0))

  // Prepend "opened" item (always first, regardless of dates)
  const sortedItems: ActivityItem[] = [
    {
      username: props.issue.user?.login || 'Unknown',
      action: `opened this ${props.issue.pullRequest ? 'pull request' : 'issue'}`,
      avatar: props.issue.user?.avatarUrl ? { src: props.issue.user.avatarUrl } : undefined,
      icon: props.issue.pullRequest ? 'i-octicon-git-pull-request-16' : 'i-octicon-issue-opened-16',
      rawDate: toDate(props.issue.createdAt)
    },
    ...items
  ]

  // Add comment form as last item
  sortedItems.push({
    slot: 'comment-form',
    avatar: user.value?.avatar ? { src: user.value.avatar } : undefined
  })

  return sortedItems
})
</script>

<template>
  <USeparator
    label="Activity"
    :ui="{ label: 'text-highlighted', container: 'ml-0' }"
    class="[&>div]:first:hidden"
  />

  <UTimeline
    :items="timelineItems"
    size="2xs"
    :ui="{
      date: 'float-end ms-1',
      title: 'flex items-center gap-1',
      description: 'text-default',
      separator: 'w-px',
      wrapper: 'pb-2 min-w-0',
      item: 'last:pb-0 [&:last-child_[data-part=separator]]:hidden'
    }"
  >
    <template #title="{ item }">
      <span class="font-medium">{{ item.username }}</span>
      <span class="font-normal text-muted">{{ item.action }}</span>
    </template>

    <template #description="{ item }">
      <!-- Review with nested review comments -->
      <div v-if="item.reviewComments?.length" class="mt-2 space-y-2">
        <!-- Review body if present -->
        <IssueComment v-if="item.description" :issue="issue" :body="item.description" />

        <!-- Nested review comments -->
        <IssueReviewComment
          v-for="comment in item.reviewComments"
          :key="comment.id"
          :issue="issue"
          :comment="comment"
        />
      </div>

      <!-- Simple comment or orphan review comment -->
      <IssueComment
        v-else-if="item.diffHunk || item.description"
        :id="item.commentId ? `comment-${item.commentId}` : undefined"
        :issue="issue"
        :body="item.description"
        :diff-hunk="item.diffHunk"
        :file-path="item.filePath"
        class="mt-2 scroll-mt-4 transition-shadow duration-500"
        :class="{ 'ring-2 ring-primary rounded-md shadow-lg shadow-primary/20': highlightedCommentId === item.commentId }"
      />
    </template>

    <template #date="{ item }">
      <span v-if="item.rawDate" class="text-xs text-dimmed">{{ useRelativeTime(item.rawDate) }}</span>
    </template>

    <template #comment-form-wrapper>
      <IssueCommentForm
        :issue="issue"
        :collaborators="collaborators"
        @refresh="emit('refresh')"
      />
    </template>
  </UTimeline>
</template>
