<script setup lang="ts">
defineProps<{
  user: Pick<User, 'login' | 'avatarUrl'>
}>()
</script>

<template>
  <UBadge
    :label="user.login"
    :avatar="{
      src: user.avatarUrl || `https://github.com/${user.login}.png`,
      alt: user.login
    }"
    class="rounded-full"
  />
</template>
