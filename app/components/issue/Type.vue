<script setup lang="ts">
import type { Type } from '#shared/types/issue'

defineProps<{
  type: Type
}>()
</script>

<template>
  <div class="px-2 py-0.5 rounded-full shrink-0 ring ring-default ring-inset" :style="{ backgroundColor: `#${type.color}` }">
    <span class="text-xs text-white invert">{{ type.name }}</span>
  </div>
</template>
