<script setup lang="ts">
import type { Type } from '#shared/types/issue'

defineProps<{
  type: Type
}>()
</script>

<template>
  <UBadge
    color="neutral"
    variant="outline"
    class="rounded-full -my-1"
  >
    <span class="size-2 rounded-full" :style="{ backgroundColor: `#${type.color}` }" />
    <span class="text-xs text-inverted invert">{{ type.name }}</span>
  </UBadge>
</template>
