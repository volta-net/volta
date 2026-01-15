<script setup lang="ts">
defineProps<{
  type: Pick<Type, 'name' | 'color'>
}>()
</script>

<template>
  <UBadge :label="type.name" class="rounded-full">
    <template #leading>
      <span class="size-2 rounded-full mx-1" :style="{ backgroundColor: `#${type.color}` }" />
    </template>
  </UBadge>
</template>
