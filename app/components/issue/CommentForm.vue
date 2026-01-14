<script setup lang="ts">
import type { MentionUser } from '~/composables/useEditorMentions'

const props = defineProps<{
  issue: IssueDetail
  collaborators?: MentionUser[]
}>()

const emit = defineEmits<{
  (e: 'refresh'): void
}>()

const toast = useToast()

const newComment = ref('')
const isSubmitting = ref(false)
const editorRef = useTemplateRef('editorRef')

async function addComment() {
  if (!newComment.value.trim()) return

  isSubmitting.value = true
  try {
    const [owner, name] = props.issue.repository.fullName.split('/')
    await $fetch(`/api/repositories/${owner}/${name}/issues/${props.issue.number}/comments`, {
      method: 'POST',
      body: { body: newComment.value }
    })
    newComment.value = ''
    emit('refresh')
    toast.add({ title: 'Comment added', icon: 'i-lucide-check' })
  } catch (err: any) {
    toast.add({ title: 'Failed to add comment', description: err.message, color: 'error', icon: 'i-lucide-x' })
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <IssueEditor
      ref="editorRef"
      v-model="newComment"
      :issue="issue"
      :collaborators="collaborators"
      :bubble-toolbar="false"
      :suggest-reply="true"
      placeholder="Leave a comment..."
      class="ring ring-default rounded-md w-full"
      :ui="{ base: 'px-4! py-3 min-h-24 text-sm [&_pre]:text-xs/5 [&_code]:text-xs/5 [&_p]:leading-6' }"
    >
      <template #toolbar="{ editor, items }">
        <div class="flex items-center gap-2 px-2 py-1 w-full border-b border-default overflow-x-auto">
          <UEditorToolbar :editor="editor" :items="items">
            <template #link>
              <EditorLinkPopover :editor="editor" />
            </template>
          </UEditorToolbar>
        </div>
      </template>
    </IssueEditor>

    <div class="flex items-center justify-end">
      <UButton
        label="Comment"
        color="neutral"
        icon="i-lucide-send"
        :loading="isSubmitting"
        :disabled="!newComment.trim()"
        @click="addComment"
      />
    </div>
  </div>
</template>
