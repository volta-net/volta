<script setup lang="ts">
defineProps<{
  repository: Repository
}>()
</script>

<template>
  <UBadge
    color="neutral"
    variant="outline"
    :avatar="{ src: `https://github.com/${repository.fullName.split('/')[0]}.png`, alt: repository.fullName }"
    class="rounded-full px-2 truncate"
  >
    <span class="text-xs text-inverted invert">{{ repository.fullName }}</span>
  </UBadge>
</template>
