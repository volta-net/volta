<script setup lang="ts">
import type { Filter } from '~/composables/useFilters'

defineProps<{
  filters: readonly Filter[]
}>()

const emit = defineEmits<{
  toggle: [filter: Filter]
  clear: []
}>()
</script>

<template>
  <div v-if="filters.length" class="flex items-center gap-1 overflow-x-auto">
    <FiltersButton
      v-for="filter in filters"
      :key="`${filter.type}-${filter.value}`"
      :filter="filter"
      :active="true"
      trailing-icon="i-lucide-x"
      @click.stop="emit('toggle', filter)"
    />
  </div>
</template>
