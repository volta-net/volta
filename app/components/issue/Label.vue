<script setup lang="ts">
const props = defineProps<{
  label: Pick<Label, 'name' | 'color'>
}>()

const isLightColor = computed(() => {
  const hex = props.label.color
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.85
})

const color = computed(() => `#${props.label.color}`)
const lightColor = computed(() => isLightColor.value ? 'var(--ui-border)' : color.value)
</script>

<template>
  <UBadge :label="label.name" class="rounded-full">
    <template #leading>
      <span
        class="size-2 rounded-full mx-1 bg-(--label-light) dark:bg-(--label-dark)"
        :style="{
          '--label-light': lightColor,
          '--label-dark': color
        }"
      />
    </template>
  </UBadge>
</template>
