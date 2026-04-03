<script setup lang="ts">
import type { ChatStatus } from 'ai'
import type { ChatPromptProps } from '@nuxt/ui'

const props = defineProps<ChatPromptProps & {
  status: ChatStatus
  error?: Error | null
  selectedModel?: string
}>()

const emit = defineEmits<{
  'submit': []
  'stop': []
  'reload': []
  'update:selectedModel': [value: string]
}>()

const input = defineModel<string>({ default: '' })
</script>

<template>
  <UChatPrompt
    v-model="input"
    :error="error"
    :variant="variant"
    placeholder="Ask Volta..."
    autofocus
    :class="props.class"
    :ui="{ footer: 'justify-end gap-0.5', base: 'px-1.5' }"
    @submit="emit('submit')"
  >
    <template #footer>
      <USelectMenu
        :model-value="selectedModel"
        :items="aiModelOptions"
        :icon="aiModelOptions.find(m => m.value === selectedModel)?.icon"
        variant="ghost"
        color="neutral"
        value-key="value"
        class="data-[state=open]:bg-elevated"
        @update:model-value="emit('update:selectedModel', $event)"
      />

      <UChatPromptSubmit
        :status="status"
        :disabled="disabled"
        :variant="disabled ? 'ghost' : 'solid'"
        @stop="emit('stop')"
        @reload="emit('reload')"
      />
    </template>
  </UChatPrompt>
</template>
