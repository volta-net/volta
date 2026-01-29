<script setup lang="ts">
import type { AgentMode, AgentResult, DuplicateSuggestion } from '~/composables/useAgentActions'

const props = defineProps<{
  mode: AgentMode | null
  result: AgentResult | null
  loading: boolean
  applying: boolean
  error: string | null
}>()

const emit = defineEmits<{
  (e: 'confirm', data: { mode: AgentMode, payload: unknown }): void
  (e: 'close'): void
}>()

const open = defineModel<boolean>('open', { default: false })

// Local state for selections
const selectedLabels = ref<Set<number>>(new Set())
const editedTitle = ref('')

// Reset selections when result changes
watch(() => props.result, (newResult) => {
  if (newResult?.mode === 'labels') {
    // Pre-select all suggested labels
    selectedLabels.value = new Set(newResult.suggestions.map(s => s.id))
  } else if (newResult?.mode === 'title') {
    editedTitle.value = newResult.title
  }
}, { immediate: true })

// Modal title based on mode
const modalTitle = computed(() => {
  switch (props.mode) {
    case 'labels': return 'Label suggestions'
    case 'title': return 'Title suggestion'
    case 'duplicates': return 'Potential duplicates'
    default: return 'AI Suggestion'
  }
})

// Handle label toggle
function toggleLabel(labelId: number) {
  if (selectedLabels.value.has(labelId)) {
    selectedLabels.value.delete(labelId)
  } else {
    selectedLabels.value.add(labelId)
  }
  // Trigger reactivity
  selectedLabels.value = new Set(selectedLabels.value)
}

// Handle confirm
function handleConfirm() {
  if (!props.mode || !props.result) return

  switch (props.result.mode) {
    case 'labels':
      emit('confirm', {
        mode: 'labels',
        payload: props.result.suggestions.filter(s => selectedLabels.value.has(s.id))
      })
      break
    case 'title':
      emit('confirm', {
        mode: 'title',
        payload: editedTitle.value
      })
      break
    case 'duplicates':
      // For duplicates, we don't confirm - user navigates to the issue
      break
  }
}

// Check if confirm button should be disabled
const isConfirmDisabled = computed(() => {
  if (props.loading || props.applying || !props.result) return true

  if (props.result.mode === 'labels') {
    return selectedLabels.value.size === 0
  }
  if (props.result.mode === 'title') {
    return !editedTitle.value.trim()
  }
  return false
})

// Check if result is empty
const isEmpty = computed(() => {
  if (!props.result) return false

  if (props.result.mode === 'labels') {
    return props.result.suggestions.length === 0
  }
  if (props.result.mode === 'duplicates') {
    return props.result.duplicates.length === 0
  }
  return false
})

// Group labels by action
const labelsToAdd = computed(() => {
  if (props.result?.mode !== 'labels') return []
  return props.result.suggestions.filter(s => s.action === 'add')
})

const labelsToRemove = computed(() => {
  if (props.result?.mode !== 'labels') return []
  return props.result.suggestions.filter(s => s.action === 'remove')
})
</script>

<template>
  <UModal
    v-model:open="open"
    :title="modalTitle"
    :ui="{ footer: 'justify-end' }"
    @update:open="(val: boolean) => !val && emit('close')"
  >
    <template #body>
      <!-- Loading state -->
      <div v-if="loading" class="flex flex-col items-center justify-center py-8 gap-3">
        <UIcon name="i-lucide-loader-circle" class="size-8 text-primary animate-spin" />
        <p class="text-sm text-muted">
          Analyzing issue...
        </p>
      </div>

      <!-- Error state -->
      <UAlert
        v-else-if="error"
        icon="i-lucide-alert-circle"
        color="error"
        :description="error"
        variant="soft"
        :ui="{ icon: 'size-4 mt-0.5' }"
      />

      <!-- Empty state -->
      <div v-else-if="isEmpty" class="flex flex-col items-center justify-center py-8 gap-3">
        <UIcon name="i-lucide-search-x" class="size-8 text-muted" />
        <p class="text-sm text-muted">
          <template v-if="result?.mode === 'labels'">
            No label changes suggested
          </template>
          <template v-else-if="result?.mode === 'duplicates'">
            No potential duplicates found
          </template>
        </p>
      </div>

      <!-- Labels suggestions -->
      <div v-else-if="result?.mode === 'labels'" class="flex flex-col gap-4">
        <!-- Labels to add -->
        <fieldset v-if="labelsToAdd.length > 0" class="flex flex-col gap-2">
          <legend class="flex items-center gap-2 text-sm font-medium text-success mb-2">
            <span>+ Add</span>
          </legend>

          <div
            v-for="label in labelsToAdd"
            :key="label.id"
            class="flex items-start gap-3 p-3 rounded-md ring ring-default hover:bg-elevated/50 transition-colors cursor-default"
            :class="{ 'bg-elevated/50': selectedLabels.has(label.id) }"
            @click="toggleLabel(label.id)"
          >
            <UCheckbox
              :model-value="selectedLabels.has(label.id)"
              size="md"
              @click.stop
              @update:model-value="toggleLabel(label.id)"
            />
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span
                  class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
                  :style="{ backgroundColor: `#${label.color}20`, color: `#${label.color}` }"
                >
                  <span
                    class="size-2 rounded-full"
                    :style="{ backgroundColor: `#${label.color}` }"
                  />
                  {{ label.name }}
                </span>
              </div>
              <p class="text-xs text-muted mt-1.5">
                {{ label.reason }}
              </p>
            </div>
          </div>
        </fieldset>

        <!-- Labels to remove -->
        <fieldset v-if="labelsToRemove.length > 0" class="flex flex-col gap-2">
          <legend class="flex items-center gap-2 text-sm font-medium text-error mb-2">
            <span>- Remove</span>
          </legend>

          <div
            v-for="label in labelsToRemove"
            :key="label.id"
            class="flex items-start gap-3 p-3 rounded-md ring ring-default hover:bg-elevated/50 transition-colors cursor-default"
            :class="{ 'bg-elevated/50': selectedLabels.has(label.id) }"
            @click="toggleLabel(label.id)"
          >
            <UCheckbox
              :model-value="selectedLabels.has(label.id)"
              size="md"
              @click.stop
              @update:model-value="toggleLabel(label.id)"
            />
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span
                  class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
                  :style="{ backgroundColor: `#${label.color}20`, color: `#${label.color}` }"
                >
                  <span
                    class="size-2 rounded-full"
                    :style="{ backgroundColor: `#${label.color}` }"
                  />
                  {{ label.name }}
                </span>
              </div>
              <p class="text-xs text-muted mt-1.5">
                {{ label.reason }}
              </p>
            </div>
          </div>
        </fieldset>
      </div>

      <!-- Title suggestion -->
      <div v-else-if="result?.mode === 'title'" class="flex flex-col gap-4">
        <UFormField label="Suggestion" size="md">
          <UInput
            v-model="editedTitle"
            class="w-full"
          />
        </UFormField>

        <UAlert
          icon="i-lucide-lightbulb"
          color="primary"
          variant="soft"
          :description="result.reason"
          :ui="{ icon: 'size-4 mt-0.5' }"
        />
      </div>

      <!-- Duplicates suggestions -->
      <div v-else-if="result?.mode === 'duplicates'" class="flex flex-col gap-2">
        <p class="text-sm text-muted mb-2">
          These issues might be related:
        </p>

        <div
          v-for="dup in (result as { mode: 'duplicates', duplicates: DuplicateSuggestion[] }).duplicates"
          :key="dup.id"
          class="flex items-start gap-3 p-3 rounded-md ring ring-default"
        >
          <UIcon
            :name="dup.state === 'open' ? 'i-lucide-circle-dot' : 'i-lucide-circle-check'"
            :class="dup.state === 'open' ? 'text-success' : 'text-important'"
            class="size-5 shrink-0 mt-0.5"
          />
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <span class="text-muted text-sm">#{{ dup.number }}</span>
              <span class="font-medium text-sm truncate">{{ dup.title }}</span>
            </div>
            <p class="text-xs text-muted mt-1">
              {{ dup.reason }}
            </p>
          </div>
          <UButton
            v-if="dup.htmlUrl"
            :to="dup.htmlUrl"
            target="_blank"
            icon="i-lucide-external-link"
            variant="ghost"
            size="xs"
          />
        </div>
      </div>
    </template>

    <template #footer>
      <UButton
        label="Cancel"
        variant="outline"
        @click="open = false"
      />
      <UButton
        v-if="!loading && result && mode !== 'duplicates'"
        :label="mode === 'labels' ? 'Apply changes' : 'Update title'"
        :loading="applying"
        :disabled="isConfirmDisabled"
        @click="handleConfirm"
      />
    </template>
  </UModal>
</template>
