<script setup lang="ts">
defineProps<{
  label: Pick<Label, 'name' | 'color'>
}>()
</script>

<template>
  <UBadge :label="label.name" class="rounded-full">
    <template #leading>
      <IssueLabelChip :color="label.color" />
    </template>
  </UBadge>
</template>
