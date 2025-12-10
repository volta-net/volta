<script setup lang="ts">
import type { Issue } from '#shared/types/issue'

const props = defineProps<{
  issue: Issue
}>()

const emit = defineEmits<{
  (e: 'refresh'): void
}>()

const toast = useToast()
const { items: editorToolbarItems } = useEditorToolbar()

const editedBody = ref(props.issue.body || '')
const isEditing = ref(false)
const isSaving = ref(false)

watch(() => props.issue.body, (newBody) => {
  editedBody.value = newBody || ''
})

async function saveBody() {
  isSaving.value = true
  try {
    const [owner, repo] = props.issue.repository!.fullName.split('/')
    await $fetch(`/api/issues/${props.issue.id}/body`, {
      method: 'PATCH',
      body: { body: editedBody.value, owner, repo, issueNumber: props.issue.number }
    })
    emit('refresh')
    toast.add({ title: 'Description updated', icon: 'i-lucide-check' })
  } catch (err: any) {
    toast.add({ title: 'Failed to update description', description: err.message, color: 'error', icon: 'i-lucide-x' })
  } finally {
    isSaving.value = false
    isEditing.value = false
  }
}

function cancelEdit() {
  isEditing.value = false
  editedBody.value = props.issue.body || ''
}
</script>

<template>
  <div class="border border-muted rounded-lg overflow-hidden">
    <div class="flex items-center justify-between px-3 py-2 bg-elevated border-b border-muted">
      <span class="text-sm font-medium">Description</span>
      <UButton
        v-if="!isEditing"
        icon="i-lucide-pencil"
        color="neutral"
        variant="ghost"
        size="xs"
        @click="isEditing = true"
      />
    </div>
    <div class="p-3">
      <template v-if="isEditing">
        <UEditor
          v-slot="{ editor }"
          v-model="editedBody"
          content-type="markdown"
          placeholder="Add a description..."
          class="min-h-32"
        >
          <UEditorToolbar :editor="editor" :items="editorToolbarItems" class="border-b border-muted mb-2 pb-2" />
        </UEditor>
        <div class="flex justify-end gap-2 mt-3">
          <UButton
            label="Cancel"
            color="neutral"
            variant="ghost"
            size="sm"
            @click="cancelEdit"
          />
          <UButton
            label="Save"
            color="primary"
            size="sm"
            :loading="isSaving"
            @click="saveBody"
          />
        </div>
      </template>
      <div
        v-else-if="issue.body"
        class="prose prose-sm dark:prose-invert max-w-none"
        v-html="issue.body"
      />
      <p v-else class="text-muted text-sm italic">
        No description provided.
      </p>
    </div>
  </div>
</template>
