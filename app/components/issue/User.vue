<script setup lang="ts">
defineProps<{
  user: Pick<User, 'login'>
}>()
</script>

<template>
  <UBadge
    color="neutral"
    variant="outline"
    :avatar="{ src: `https://github.com/${user.login}.png`, alt: user.login }"
    class="rounded-full px-2"
  >
    <span class="text-xs text-inverted invert">{{ user.login }}</span>
  </UBadge>
</template>
