<script setup lang="ts">
defineProps<{
  repository: Repository
}>()
</script>

<template>
  <UBadge
    :label="repository.fullName"
    :avatar="{
      src: `https://github.com/${repository.fullName.split('/')[0]}.png`,
      alt: repository.fullName
    }"
    class="rounded-full"
  />
</template>
