<script setup lang="ts">
import type { Issue } from '#shared/types/issue'
import type { TimelineItem } from '@nuxt/ui'

const props = defineProps<{
  issue: Issue
}>()

interface ActivityItem extends TimelineItem {
  sortDate: Date
  username?: string
  action?: string
  avatar?: { src: string }
}

const timelineItems = computed<ActivityItem[]>(() => {
  const items: ActivityItem[] = []

  // Issue/PR created
  items.push({
    date: useTimeAgo(new Date(props.issue.createdAt)).value,
    username: props.issue.user?.login || 'Unknown',
    action: `opened this ${props.issue.pullRequest ? 'pull request' : 'issue'}`,
    avatar: props.issue.user?.avatarUrl ? { src: props.issue.user.avatarUrl } : undefined,
    icon: props.issue.pullRequest ? 'i-octicon-git-pull-request-16' : 'i-octicon-issue-opened-16',
    sortDate: new Date(props.issue.createdAt)
  })

  // Comments
  props.issue.comments?.forEach((comment) => {
    items.push({
      date: useTimeAgo(new Date(comment.createdAt)).value,
      username: comment.user?.login || 'Unknown',
      action: 'commented',
      description: comment.body,
      avatar: comment.user?.avatarUrl ? { src: comment.user.avatarUrl } : undefined,
      icon: 'i-octicon-comment-16',
      sortDate: new Date(comment.createdAt)
    })
  })

  // Closed/Merged
  if (props.issue.closedAt) {
    const isMerged = props.issue.pullRequest && props.issue.merged
    const actor = isMerged ? props.issue.mergedBy : props.issue.closedBy
    items.push({
      date: useTimeAgo(new Date(props.issue.mergedAt || props.issue.closedAt)).value,
      username: actor?.login || 'Unknown',
      action: isMerged ? 'merged this pull request' : `closed this ${props.issue.pullRequest ? 'pull request' : 'issue'}`,
      avatar: actor?.avatarUrl ? { src: actor.avatarUrl } : undefined,
      icon: isMerged ? 'i-octicon-git-merge-16' : 'i-octicon-issue-closed-16',
      sortDate: new Date(props.issue.mergedAt || props.issue.closedAt)
    })
  }

  // Sort by date
  return items.sort((a, b) => a.sortDate.getTime() - b.sortDate.getTime())
})
</script>

<template>
  <div class="border border-muted rounded-lg overflow-hidden">
    <div class="px-3 py-2 bg-elevated border-b border-muted">
      <span class="text-sm font-medium">Activity</span>
    </div>
    <div class="p-4">
      <UTimeline
        :items="timelineItems"
        size="xs"
        color="neutral"
        :ui="{
          date: 'float-end ms-1',
          description: 'px-3 py-2 ring ring-muted mt-2 rounded-md text-default text-sm whitespace-pre-wrap'
        }"
      >
        <template #title="{ item }">
          <div class="flex items-center gap-1.5">
            <span class="font-medium">{{ (item as ActivityItem).username }}</span>
            <span class="font-normal text-muted">{{ (item as ActivityItem).action }}</span>
          </div>
        </template>
        <template #date="{ item }">
          <span class="text-xs text-dimmed">{{ item.date }}</span>
        </template>
      </UTimeline>
    </div>
  </div>
</template>
