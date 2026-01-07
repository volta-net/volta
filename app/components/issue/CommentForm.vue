<script setup lang="ts">
import type { IssueDetail } from '#shared/types/issue'
import type { MentionUser } from '~/composables/useEditorMentions'

interface IssueReference {
  id: number
  number: number
  title: string
  state: string
  pullRequest: boolean
}

const props = defineProps<{
  issue: IssueDetail
  collaborators?: MentionUser[]
  repositoryIssues?: IssueReference[]
}>()

const emit = defineEmits<{
  (e: 'refresh'): void
}>()

const toast = useToast()
const { items: editorToolbarItems } = useEditorToolbar()

const newComment = ref('')
const isSubmitting = ref(false)

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
  <div class="border border-muted rounded-lg overflow-hidden">
    <div class="px-3 py-2 bg-elevated border-b border-muted">
      <span class="text-sm font-medium">Add a comment</span>
    </div>
    <div class="p-3">
      <IssueEditor
        v-model="newComment"
        :issue="issue"
        :collaborators="collaborators"
        :repository-issues="repositoryIssues"
        :bubble-toolbar="false"
        placeholder="Write a comment..."
        class="min-h-24"
      >
        <template #toolbar="{ editor }">
          <UEditorToolbar :editor="editor" :items="editorToolbarItems" class="border-b border-muted mb-2 pb-2" />
        </template>
      </IssueEditor>

      <div class="flex justify-end mt-3">
        <UButton
          label="Comment"
          color="primary"
          icon="i-lucide-send"
          :loading="isSubmitting"
          :disabled="!newComment.trim()"
          @click="addComment"
        />
      </div>
    </div>
  </div>
</template>
