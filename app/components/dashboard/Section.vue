<script setup lang="ts">
defineProps<{
  title: string
  icon: string
  count?: number
  emptyText?: string
}>()
</script>

<template>
  <UCard
    :ui="{
      header: 'p-3 sm:p-3',
      body: 'p-0 sm:p-0 overflow-y-auto'
    }"
    class="flex flex-col"
  >
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon :name="icon" class="size-4 text-muted shrink-0" />
        <h3 class="font-medium text-sm truncate">
          {{ title }}
        </h3>
        <UBadge
          v-if="count !== undefined && count > 0"
          color="neutral"
          variant="subtle"
          size="sm"
        >
          {{ count }}
        </UBadge>
      </div>
    </template>

    <slot v-if="$slots.default" />

    <div v-else class="p-4 text-center text-sm text-muted">
      {{ emptyText || 'No items' }}
    </div>
  </UCard>
</template>
