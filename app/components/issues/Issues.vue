<script setup lang="ts">
const props = defineProps<{
  issues: Issue[]
}>()

const issuesRefs = ref<Record<number, Element>>({})
const selectedIssue = defineModel<Issue | null>()

watch(selectedIssue, () => {
  if (!selectedIssue.value) {
    return
  }
  const ref = issuesRefs.value[selectedIssue.value.id]
  if (ref) {
    ref.scrollIntoView({ block: 'nearest' })
  }
})

// Keep selectedIssue in sync with issues array after refresh
watch(() => props.issues, (newIssues) => {
  if (selectedIssue.value) {
    const updated = newIssues.find(i => i.id === selectedIssue.value!.id)
    if (updated) {
      selectedIssue.value = updated
    }
  }
}, { deep: true })

defineShortcuts({
  arrowdown: () => {
    const index = props.issues.findIndex(issue => issue.id === selectedIssue.value?.id)

    if (index === -1) {
      selectedIssue.value = props.issues[0]
    } else if (index < props.issues.length - 1) {
      selectedIssue.value = props.issues[index + 1]
    }
  },
  arrowup: () => {
    const index = props.issues.findIndex(issue => issue.id === selectedIssue.value?.id)

    if (index === -1) {
      selectedIssue.value = props.issues[props.issues.length - 1]
    } else if (index > 0) {
      selectedIssue.value = props.issues[index - 1]
    }
  }
})
</script>

<template>
  <div class="overflow-y-auto divide-y divide-default isolate focus:outline-none">
    <IssuesItem
      v-for="issue in issues"
      :key="issue.id"
      :ref="(el: any) => { issuesRefs[issue.id] = el?.$el as Element }"
      :item="issue"
      :selected="selectedIssue?.id === issue.id"
      @select="selectedIssue = $event"
    />
  </div>
</template>
