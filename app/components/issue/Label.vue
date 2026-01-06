<script setup lang="ts">
import type { Label } from '#shared/types/issue'

defineProps<{
  label: Omit<Label, 'description'>
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
