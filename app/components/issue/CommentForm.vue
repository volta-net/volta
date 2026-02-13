<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { MentionUser } from '~/composables/useEditorMentions'

const props = defineProps<{
  issue: IssueDetail
  readonly?: boolean
  collaborators?: MentionUser[]
}>()

const emit = defineEmits<{
  (e: 'refresh' | 'reopen-issue' | 'close-as-duplicate'): void
  (e: 'close-issue', stateReason: 'completed' | 'not_planned'): void
  (e: 'comment-add', payload: { tempId: number, body: string, createdAt: string }): void
  (e: 'comment-added', payload: { tempId: number, commentId: number }): void
  (e: 'comment-failed', tempId: number): void
}>()

const toast = useToast()

const newComment = ref('')
const isSubmitting = ref(false)

const isOpen = computed(() => props.issue.state === 'open')
const isIssue = computed(() => !props.issue.pullRequest)

// Close reason dropdown items
const closeItems = computed<DropdownMenuItem[][]>(() => [[
  {
    label: 'Close as completed',
    icon: 'i-lucide-circle-check',
    ui: { itemLeadingIcon: 'text-important group-data-highlighted:text-important' },
    onSelect: () => emit('close-issue', 'completed')
  },
  {
    label: 'Close as not planned',
    icon: 'i-lucide-circle-slash',
    onSelect: () => emit('close-issue', 'not_planned')
  },
  {
    label: 'Close as duplicate',
    icon: 'i-lucide-copy',
    onSelect: () => emit('close-as-duplicate')
  }
]])

defineShortcuts({
  meta_s: {
    usingInput: true,
    handler: (e) => {
      e.preventDefault()
      e.stopPropagation()

      addComment()
    }
  },
  meta_enter: {
    usingInput: true,
    handler: (e) => {
      e.preventDefault()
      e.stopPropagation()

      addComment()
    }
  }
})

async function addComment() {
  if (!newComment.value.trim() || isSubmitting.value) return

  const body = newComment.value.trim()
  const tempId = -Date.now()
  const createdAt = new Date().toISOString()

  isSubmitting.value = true
  emit('comment-add', { tempId, body, createdAt })
  newComment.value = ''

  try {
    const [owner, name] = props.issue.repository.fullName.split('/')
    const response = await $fetch<{ success: boolean, commentId: number }>(`/api/repositories/${owner}/${name}/issues/${props.issue.number}/comments`, {
      method: 'POST',
      body: { body }
    })
    emit('comment-added', { tempId, commentId: response.commentId })
    emit('refresh')
    toast.add({ title: 'Comment added', icon: 'i-lucide-check' })
  } catch (err: any) {
    emit('comment-failed', tempId)
    newComment.value = body
    toast.add({ title: 'Failed to add comment', description: err.message, color: 'error', icon: 'i-lucide-x' })
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <IssueEditor
      v-model="newComment"
      :issue="issue"
      :collaborators="collaborators"
      :bubble-toolbar="false"
      :suggest-reply="true"
      placeholder="Leave a comment..."
      class="ring ring-default rounded-md w-full"
      :ui="{ base: 'px-4 sm:px-4 py-3 min-h-24' }"
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

    <div class="flex items-center justify-end gap-1.5">
      <!-- Close / Reopen button (issues only, requires write access) -->
      <template v-if="isIssue && !readonly">
        <UFieldGroup v-if="isOpen">
          <UButton
            label="Close issue"
            icon="i-lucide-circle-check"
            color="neutral"
            variant="outline"
            :ui="{ leadingIcon: 'text-important' }"
            @click="emit('close-issue', 'completed')"
          />
          <UDropdownMenu :items="closeItems" :content="{ align: 'end' }">
            <UButton
              icon="i-lucide-chevron-down"
              color="neutral"
              variant="outline"
            />
          </UDropdownMenu>
        </UFieldGroup>

        <UButton
          v-else
          label="Reopen issue"
          icon="i-lucide-circle-dot"
          color="neutral"
          variant="subtle"
          @click="emit('reopen-issue')"
        />
      </template>

      <UTooltip text="Submit comment" :kbds="['meta', 's']">
        <UButton
          label="Comment"
          icon="i-lucide-send"
          :loading="isSubmitting"
          :disabled="!newComment.trim()"
          @click="addComment"
        />
      </UTooltip>
    </div>
  </div>
</template>
