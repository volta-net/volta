<script setup lang="ts">
defineProps<{
  user: User
}>()
</script>

<template>
  <UBadge
    color="neutral"
    variant="outline"
    :avatar="{ src: `https://github.com/${user.login}.png`, alt: user.login }"
    class="rounded-full -my-1"
  >
    <span class="text-xs text-inverted invert">{{ user.login }}</span>
  </UBadge>
</template>
