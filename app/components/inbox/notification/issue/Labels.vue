<script setup lang="ts">
import type { IssueDetail, Label } from '#shared/types/issue'

const props = defineProps<{
  issue: IssueDetail
}>()

const emit = defineEmits<{
  (e: 'refresh'): void
}>()

const toast = useToast()
const isOpen = ref(false)
const availableLabels = ref<Label[]>([])

const selectedLabelIds = computed(() => props.issue.labels?.map(l => l.id) ?? [])

async function fetchLabels() {
  if (!props.issue.repository?.fullName) return
  const [owner, name] = props.issue.repository.fullName.split('/')
  try {
    const labels = await $fetch<Label[]>(`/api/repositories/${owner}/${name}/labels`)
    availableLabels.value = labels ?? []
  } catch {
    // Labels not available
  }
}

async function toggleLabel(label: Label) {
  const hasLabel = selectedLabelIds.value.includes(label.id)
  const [owner, name] = props.issue.repository.fullName.split('/')

  try {
    if (hasLabel) {
      await $fetch(`/api/repositories/${owner}/${name}/issues/${props.issue.number}/labels/${label.id}`, {
        method: 'DELETE'
      })
    } else {
      await $fetch(`/api/repositories/${owner}/${name}/issues/${props.issue.number}/labels`, {
        method: 'POST',
        body: { labelId: label.id }
      })
    }
    emit('refresh')
  } catch (err: any) {
    toast.add({ title: 'Failed to update labels', description: err.message, color: 'error', icon: 'i-lucide-x' })
  }
}

function handleOpen(open: boolean) {
  if (open) {
    fetchLabels()
  }
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <template v-if="issue.labels?.length">
      <UBadge
        v-for="label in issue.labels"
        :key="label.id"
        :label="label.name"
        variant="subtle"
        :style="{ '--badge-bg': `#${label.color}20`, '--badge-color': `#${label.color}` }"
        :ui="{ base: 'bg-[var(--badge-bg)] text-[var(--badge-color)]' }"
      />
    </template>
    <UPopover v-model:open="isOpen" @update:open="handleOpen">
      <UButton
        icon="i-lucide-plus"
        color="neutral"
        variant="ghost"
        size="xs"
        label="Add label"
      />
      <template #content>
        <div class="p-2 w-56 max-h-64 overflow-y-auto">
          <p class="text-xs text-muted mb-2 px-1">
            Select labels
          </p>
          <div class="space-y-0.5">
            <button
              v-for="label in availableLabels"
              :key="label.id"
              class="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-elevated transition-colors"
              @click="toggleLabel(label)"
            >
              <span
                class="w-3 h-3 rounded-full shrink-0"
                :style="{ backgroundColor: `#${label.color}` }"
              />
              <span class="truncate flex-1 text-left">{{ label.name }}</span>
              <UIcon
                v-if="selectedLabelIds.includes(label.id)"
                name="i-lucide-check"
                class="size-4 text-primary shrink-0"
              />
            </button>
          </div>
        </div>
      </template>
    </UPopover>
  </div>
</template>
