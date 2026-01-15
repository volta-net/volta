<script setup lang="ts">
defineProps<{
  user: Pick<User, 'login'>
}>()
</script>

<template>
  <UBadge
    :label="user.login"
    :avatar="{
      src: `https://github.com/${user.login}.png`,
      alt: user.login
    }"
    class="rounded-full"
  />
</template>
