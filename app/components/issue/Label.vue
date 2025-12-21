<script setup lang="ts">
import type { Label } from '#shared/types/issue'

defineProps<{
  label: Label
}>()
</script>

<template>
  <UBadge
    color="neutral"
    variant="outline"
    class="rounded-full"
  >
    <span class="size-2 rounded-full" :style="{ backgroundColor: `#${label.color}` }" />
    <span class="text-xs text-white invert">{{ label.name }}</span>
  </UBadge>
</template>
