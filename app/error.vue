<script setup lang="ts">
import type { NuxtError } from '#app'

defineProps<{
  error: NuxtError
}>()
</script>

<template>
  <div class="flex flex-col h-screen">
    <div class="flex-1 flex flex-col items-center justify-center gap-8 rounded-lg ring ring-default bg-default/75 shadow m-4">
      <UError :error="error" class="min-h-0" />
    </div>
  </div>
</template>
