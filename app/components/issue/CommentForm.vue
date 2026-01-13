<script setup lang="ts">
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
  suggestedAnswer?: string | null
}>()

const emit = defineEmits<{
  (e: 'refresh'): void
}>()

const toast = useToast()

const newComment = ref('')
const isSubmitting = ref(false)
const editorRef = useTemplateRef('editorRef')

// Track if we've pre-filled with suggestion (to avoid overwriting user edits)
const suggestionApplied = ref(false)
const isAiSuggestion = computed(() => suggestionApplied.value && newComment.value === props.suggestedAnswer)

// Pre-fill editor with suggested answer when it arrives (only once)
watch(() => props.suggestedAnswer, (suggestion) => {
  if (suggestion && !newComment.value.trim() && !suggestionApplied.value) {
    newComment.value = suggestion
    suggestionApplied.value = true
  }
}, { immediate: true })

function clearSuggestion() {
  newComment.value = ''
  suggestionApplied.value = true // Prevent re-applying
}

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
    suggestionApplied.value = false // Allow suggestion again after posting
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
  <div class="flex flex-col items-start flex-1 gap-4">
    <IssueEditor
      ref="editorRef"
      v-model="newComment"
      :issue="issue"
      :collaborators="collaborators"
      :repository-issues="repositoryIssues"
      :bubble-toolbar="false"
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

          <USeparator orientation="vertical" class="self-stretch" />

          <UButton
            v-if="isAiSuggestion"
            icon="i-lucide-x"
            color="warning"
            variant="soft"
            label="Clear suggestion"
            class="ms-auto"
            @click="clearSuggestion"
          />
        </div>
      </template>
    </IssueEditor>

    <UButton
      label="Comment"
      color="neutral"
      icon="i-lucide-send"
      class="self-end"
      :loading="isSubmitting"
      :disabled="!newComment.trim()"
      @click="addComment"
    />
  </div>
</template>
