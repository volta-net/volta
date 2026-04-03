<script setup lang="ts">
const emit = defineEmits<{
  ask: [question: string]
}>()

const suggestions = [
  {
    icon: 'i-lucide-search',
    title: 'Triage open issues',
    description: 'Find stale or unanswered issues',
    question: 'What open issues need attention? Show me issues that have been waiting the longest or have no comments yet.'
  },
  {
    icon: 'i-lucide-git-pull-request',
    title: 'Review open PRs',
    description: 'PRs waiting for review or feedback',
    question: 'What open PRs across my repositories need my review? Highlight any that have been waiting the longest or have active discussions.'
  },
  {
    icon: 'i-lucide-chart-pie',
    title: 'Weekly report',
    description: 'Activity stats and trends',
    question: 'Give me a weekly report: how many issues and PRs were opened vs closed, what are the trends, and what needs my attention?'
  }
]
</script>

<template>
  <div class="w-full grid grid-cols-1 sm:grid-cols-3 gap-3">
    <button
      v-for="suggestion in suggestions"
      :key="suggestion.title"
      class="flex sm:flex-col gap-3 p-4 rounded-lg border border-default bg-default hover:bg-elevated/50 text-left transition-colors cursor-pointer"
      @click="emit('ask', suggestion.question)"
    >
      <UIcon :name="suggestion.icon" class="size-5 text-muted" />
      <div>
        <p class="text-sm font-medium text-highlighted">
          {{ suggestion.title }}
        </p>
        <p class="text-sm text-muted mt-0.5 hidden sm:block">
          {{ suggestion.description }}
        </p>
      </div>
    </button>
  </div>
</template>
