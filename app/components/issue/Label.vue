<script setup lang="ts">
import type { Label } from '#shared/types/issue'

defineProps<{
  label: Label
}>()
</script>

<template>
  <div class="px-2 py-0.5 rounded-full shrink-0 ring ring-default ring-inset" :style="{ backgroundColor: `#${label.color}` }">
    <span class="text-xs text-white invert">{{ label.name }}</span>
  </div>
</template>
