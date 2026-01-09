<script setup lang="ts">
defineProps<{
  label: Pick<Label, 'name' | 'color'>
}>()
</script>

<template>
  <UBadge
    color="neutral"
    variant="outline"
    class="rounded-full px-2"
  >
    <span class="size-2 rounded-full mx-1" :style="{ backgroundColor: `#${label.color}` }" />
    <span class="text-xs text-inverted invert">{{ label.name }}</span>
  </UBadge>
</template>
