<script setup lang="ts">
defineProps<{
  issue: IssueDetail
  body?: string
  diffHunk?: string
  filePath?: string
}>()

// Get diff hunk without the @@ header line
function getDiffHunkWithoutHeader(diffHunk: string): string {
  const lines = diffHunk.split('\n')
  if (lines[0]?.startsWith('@@')) {
    return lines.slice(1).join('\n')
  }
  return diffHunk
}
</script>

<template>
  <div class="ring ring-default rounded-md overflow-hidden">
    <!-- File path header for review comments -->
    <div v-if="filePath" class="flex items-center gap-2 px-4 py-3 bg-muted/50 border-b border-default text-xs text-muted">
      <UIcon name="i-octicon-file-16" class="size-3.5 shrink-0" />
      <span class="truncate font-mono text-highlighted">{{ filePath }}</span>
    </div>

    <!-- Code diff for review comments -->
    <MDC
      v-if="diffHunk"
      :value="`\`\`\`diff\n${getDiffHunkWithoutHeader(diffHunk)}\n\`\`\``"
      class="[&>div]:my-0! [&_pre]:rounded-none! [&_pre]:border-0!"
    />

    <!-- Comment body -->
    <IssueEditor
      :issue="issue"
      :model-value="body"
      :editable="false"
      :ui="{ base: 'px-4 sm:px-4 py-3' }"
    />
  </div>
</template>
