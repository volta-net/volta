<script setup lang="ts">
import type { ButtonProps, ButtonSlots } from '@nuxt/ui'
import type { Filter } from '~/composables/useFilters'

withDefaults(defineProps<Pick<ButtonProps, 'color' | 'variant' | 'activeColor' | 'activeVariant' | 'active'> & {
  filter: Filter
}>(), {
  color: 'neutral',
  variant: 'outline',
  activeColor: 'primary',
  activeVariant: 'subtle',
  active: false
})

const slots = defineSlots<ButtonSlots>()
</script>

<template>
  <UButton
    :label="filter.label"
    :icon="filter.icon"
    :avatar="filter.avatar ? {
      src: filter.avatar,
      alt: filter.label,
      loading: 'lazy'
    } : undefined"
    :color="color"
    :variant="variant"
    :active-color="activeColor"
    :active-variant="activeVariant"
    :active="active"
    size="xs"
    class="border border-dashed ring-0 py-[3px] group"
    :class="[active ? 'border-primary/50' : 'border-accented']"
    :ui="{ trailingIcon: 'size-3.5 text-muted group-hover:text-highlighted transition-colors' }"
  >
    <template v-if="filter.chip" #leading>
      <IssueLabelChip :color="filter.chip.color" />
    </template>

    <template v-for="(_, name) in slots" #[name]="slotData">
      <slot :name="name" v-bind="slotData" />
    </template>
  </UButton>
</template>
