<script setup lang="ts">
const props = defineProps<{
  color: string
}>()

const isLightColor = computed(() => {
  const hex = props.color
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.85
})

const labelColor = computed(() => `#${props.color}`)
const labelLightColor = computed(() => isLightColor.value ? 'var(--ui-border)' : labelColor.value)
</script>

<template>
  <span
    class="size-2 rounded-full mx-1 bg-(--label-light) dark:bg-(--label-dark)"
    :style="{
      '--label-light': labelLightColor,
      '--label-dark': labelColor
    }"
  />
</template>
