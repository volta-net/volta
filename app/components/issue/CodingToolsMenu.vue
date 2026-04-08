<script setup lang="ts">
const props = defineProps<{
  issue: IssueDetail
}>()

const { items } = useCodingTools(computed(() => props.issue))
</script>

<template>
  <UDropdownMenu
    :items="items"
    filter
    :ui="{ content: 'w-40 max-h-80 overflow-y-auto' }"
    :content="{ align: 'end' }"
  >
    <UTooltip text="Open in...">
      <UButton
        icon="i-lucide-code"
        variant="ghost"
      />
    </UTooltip>
  </UDropdownMenu>
</template>
