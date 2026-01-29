<script lang="ts" setup>
interface ConfirmDialogProps {
  title?: string
  description?: string
  icon?: string
  color?: 'primary' | 'error' | 'warning' | 'success' | 'neutral'
  confirmLabel?: string
  cancelLabel?: string
}

withDefaults(defineProps<ConfirmDialogProps>(), {
  title: 'Are you sure?',
  confirmLabel: 'Confirm',
  cancelLabel: 'Cancel',
  color: 'error'
})

const emit = defineEmits<{
  close: [value: boolean]
}>()
</script>

<template>
  <UModal
    :title="title"
    :description="description"
    :ui="{ header: 'items-start', footer: 'justify-end', close: '-mt-0.5' }"
  >
    <template v-if="icon" #leading>
      <UIcon :name="icon" class="size-6" :class="`text-${color}`" />
    </template>

    <template #footer>
      <UButton
        :label="cancelLabel"
        color="neutral"
        variant="outline"
        @click="emit('close', false)"
      />
      <UButton :label="confirmLabel" :color="color" @click="emit('close', true)" />
    </template>
  </UModal>
</template>
