<script setup lang="ts">
import type { IssueReviewComment } from '#shared/types'

const props = defineProps<{
  issue: IssueDetail
  comment: IssueReviewComment
}>()

// Parse suggestion from comment body
const suggestion = computed(() => {
  const match = props.comment.body?.match(/```suggestion\n([\s\S]*?)```/)
  return match ? match[1] : null
})

// Get the comment body without the suggestion block
const bodyWithoutSuggestion = computed(() => {
  if (!suggestion.value) return props.comment.body
  return props.comment.body?.replace(/```suggestion\n[\s\S]*?```/, '').trim() || null
})

// Parse the diff hunk to extract context and the line being commented on
const parsedDiff = computed(() => {
  if (!props.comment.diffHunk) return null

  const lines = props.comment.diffHunk.split('\n')
  const contextLines: { type: 'context' | 'addition' | 'deletion', content: string, oldNum?: number, newNum?: number }[] = []

  let oldLineNum = 0
  let newLineNum = 0

  // Parse the @@ header to get starting line numbers
  const headerMatch = lines[0]?.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
  if (headerMatch?.[1] && headerMatch?.[2]) {
    oldLineNum = parseInt(headerMatch[1]) - 1
    newLineNum = parseInt(headerMatch[2]) - 1
  }

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (line === undefined) continue

    if (line.startsWith('-')) {
      oldLineNum++
      contextLines.push({ type: 'deletion', content: line.slice(1), oldNum: oldLineNum })
    } else if (line.startsWith('+')) {
      newLineNum++
      contextLines.push({ type: 'addition', content: line.slice(1), newNum: newLineNum })
    } else {
      oldLineNum++
      newLineNum++
      contextLines.push({ type: 'context', content: line.startsWith(' ') ? line.slice(1) : line, oldNum: oldLineNum, newNum: newLineNum })
    }
  }

  return contextLines
})

// Get the original line(s) that would be replaced by the suggestion
// This is typically the last addition line(s) or the last line in the diff context
const originalLines = computed(() => {
  if (!parsedDiff.value) return []

  // Get all addition lines at the end of the diff (these are the lines being suggested to change)
  const additions: string[] = []
  for (let i = parsedDiff.value.length - 1; i >= 0; i--) {
    const line = parsedDiff.value[i]
    if (line?.type === 'addition') {
      additions.unshift(line.content)
    } else {
      break
    }
  }

  // If no additions, get the last context line
  if (additions.length === 0) {
    const lastContext = parsedDiff.value.filter(l => l.type === 'context').pop()
    return lastContext ? [lastContext.content] : []
  }

  return additions
})

// Get the suggested lines (split by newline in case of multi-line suggestions)
const suggestedLines = computed(() => {
  if (!suggestion.value) return []
  // Split and remove trailing empty line if present (common from suggestion block format)
  const lines = suggestion.value.split('\n')
  if (lines.length > 1 && lines[lines.length - 1] === '') {
    lines.pop()
  }
  return lines
})

// Check if this is a suggestion comment
const hasSuggestion = computed(() => suggestion.value !== null)

// Generate diff markdown for MDC rendering
const suggestionDiff = computed(() => {
  if (!hasSuggestion.value) return null

  const lines: string[] = []
  originalLines.value.forEach(line => lines.push(`- ${line}`))
  suggestedLines.value.forEach(line => lines.push(`+ ${line}`))

  return `\`\`\`diff\n${lines.join('\n')}\n\`\`\``
})

// Get diff hunk without the @@ header line
const diffHunkWithoutHeader = computed(() => {
  if (!props.comment.diffHunk) return null
  const lines = props.comment.diffHunk.split('\n')
  // Skip the first line if it's a hunk header
  if (lines[0]?.startsWith('@@')) {
    return lines.slice(1).join('\n')
  }
  return props.comment.diffHunk
})
</script>

<template>
  <div class="ring ring-default rounded-md overflow-hidden">
    <!-- File path header -->
    <div v-if="comment.path" class="flex items-center gap-1.5 px-4 py-3 border-b border-default text-xs">
      <UIcon name="i-lucide-file" class="size-3.5 shrink-0 text-muted" />
      <span class="truncate font-mono text-default">{{ comment.path }}</span>
    </div>

    <!-- Code diff -->
    <MDC
      v-if="diffHunkWithoutHeader"
      :value="`\`\`\`diff\n${diffHunkWithoutHeader}\n\`\`\``"
      class="[&>div]:my-0! [&_pre]:rounded-none! [&_pre]:border-0! [&_pre]:bg-muted/50!"
    />

    <!-- Comment body with user info -->
    <div class="px-4 py-3" :class="{ 'border-t border-default': comment.diffHunk }">
      <div class="flex items-center gap-2 mb-2">
        <UAvatar v-if="comment.user?.avatarUrl" :src="comment.user.avatarUrl" size="2xs" />
        <span class="text-sm font-medium text-highlighted">
          {{ comment.user?.login || 'Unknown' }}
          <span class="font-normal text-muted">{{ hasSuggestion ? 'suggested change' : 'commented' }}</span>
        </span>
        <span class="text-xs text-dimmed ms-auto">{{ useRelativeTime(new Date(comment.createdAt)) }}</span>
      </div>

      <!-- Suggested change block (inside body) -->
      <MDC
        v-if="hasSuggestion && suggestionDiff"
        :value="suggestionDiff"
        class="[&>div]:my-0!"
      />

      <!-- Show body without suggestion block if there's other content -->
      <IssueEditor
        v-if="bodyWithoutSuggestion"
        :issue="issue"
        :model-value="bodyWithoutSuggestion"
        :editable="false"
      />
    </div>
  </div>
</template>
