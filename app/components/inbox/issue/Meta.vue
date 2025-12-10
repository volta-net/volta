<script setup lang="ts">
import type { Issue } from '#shared/types/issue'

defineProps<{
  issue: Issue
}>()
</script>

<template>
  <div class="space-y-4">
    <!-- Assignees -->
    <div v-if="issue.assignees?.length" class="flex items-center gap-2">
      <span class="text-sm text-muted">Assignees:</span>
      <UAvatarGroup size="xs" :max="5">
        <UTooltip v-for="assignee in issue.assignees" :key="assignee.id" :text="assignee.login">
          <UAvatar
            :src="assignee.avatarUrl!"
            :alt="assignee.login"
          />
        </UTooltip>
      </UAvatarGroup>
    </div>

    <!-- PR specific info -->
    <div v-if="issue.type === 'pull_request'" class="flex items-center gap-4 text-sm">
      <div class="flex items-center gap-1">
        <UIcon name="i-octicon-git-commit-16" class="size-4 text-muted" />
        <span>{{ issue.commits }} commit{{ issue.commits !== 1 ? 's' : '' }}</span>
      </div>
      <div class="flex items-center gap-1 text-emerald-500">
        <span>+{{ issue.additions }}</span>
      </div>
      <div class="flex items-center gap-1 text-red-500">
        <span>-{{ issue.deletions }}</span>
      </div>
      <div class="flex items-center gap-1">
        <UIcon name="i-octicon-file-diff-16" class="size-4 text-muted" />
        <span>{{ issue.changedFiles }} file{{ issue.changedFiles !== 1 ? 's' : '' }}</span>
      </div>
    </div>

    <!-- Requested reviewers -->
    <div v-if="issue.requestedReviewers?.length" class="flex items-center gap-2">
      <span class="text-sm text-muted">Reviewers:</span>
      <UAvatarGroup size="xs" :max="5">
        <UTooltip v-for="reviewer in issue.requestedReviewers" :key="reviewer.id" :text="reviewer.login">
          <UAvatar
            :src="reviewer.avatarUrl!"
            :alt="reviewer.login"
          />
        </UTooltip>
      </UAvatarGroup>
    </div>
  </div>
</template>
