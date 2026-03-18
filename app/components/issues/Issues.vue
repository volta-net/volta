<script setup lang="ts">
import type { Filter } from '~/composables/useFilters'

const props = defineProps<{
  issues: Issue[]
  activeFilters?: readonly Filter[]
}>()

const emit = defineEmits<{
  filter: [filter: Filter]
}>()

const scrollArea = useTemplateRef('scrollArea')
const selectedIssue = defineModel<Issue | null>()

function scrollToSelected() {
  if (!selectedIssue.value) return

  const index = props.issues.findIndex(i => i.id === selectedIssue.value!.id)
  if (index !== -1) {
    scrollArea.value?.virtualizer?.scrollToIndex(index)
  }
}

// Scroll when selection changes or when the list renders/updates with a selected item
// flush: 'post' ensures the virtualizer is ready before scrolling
watch([selectedIssue, () => props.issues], scrollToSelected, { flush: 'post' })

// Keep selectedIssue in sync with issues array after refresh
watch(() => props.issues, (newIssues) => {
  if (selectedIssue.value) {
    const updated = newIssues.find(i => i.id === selectedIssue.value!.id)
    if (updated) {
      selectedIssue.value = updated
    }
  }
}, { deep: true })

function selectNextIssue(delta: number) {
  const index = props.issues.findIndex(issue => issue.id === selectedIssue.value?.id)

  if (index === -1) {
    selectedIssue.value = props.issues[0]
  } else {
    const newIndex = index + delta
    if (newIndex >= 0 && newIndex < props.issues.length) {
      selectedIssue.value = props.issues[newIndex]
    }
  }
}

defineShortcuts({
  arrowdown: () => selectNextIssue(1),
  arrowup: () => selectNextIssue(-1),
  j: () => selectNextIssue(1),
  k: () => selectNextIssue(-1)
})
</script>

<template>
  <UScrollArea
    ref="scrollArea"
    v-slot="{ item: issue }"
    :items="issues"
    :virtualize="{ estimateSize: 44 }"
    class="isolate focus:outline-none"
    :ui="{ viewport: 'divide-y divide-default' }"
  >
    <IssuesItem
      :item="issue"
      :selected="selectedIssue?.id === issue.id"
      :active-filters="activeFilters"
      @select="selectedIssue = $event"
      @filter="emit('filter', $event)"
    />
  </UScrollArea>
</template>
