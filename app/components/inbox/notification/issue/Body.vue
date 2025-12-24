<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import type { EditorCustomHandlers } from '@nuxt/ui'
import type { IssueDetail } from '#shared/types/issue'
import ImageUpload from '~/components/editor/ImageUpload'
import { Emoji } from '@tiptap/extension-emoji'

const props = defineProps<{
  issue: IssueDetail
}>()

const emit = defineEmits<{
  (e: 'refresh'): void
}>()

const editorRef = useTemplateRef('editorRef')

const toast = useToast()

const { extension: completionExtension, handlers: aiHandlers, isLoading: aiLoading } = useEditorCompletion(editorRef)

// Custom handlers for editor (merged with AI handlers)
const customHandlers = {
  imageUpload: {
    canExecute: (editor: Editor) => editor.can().insertContent({ type: 'imageUpload' }),
    execute: (editor: Editor) => editor.chain().focus().insertContent({ type: 'imageUpload' }),
    isActive: (editor: Editor) => editor.isActive('imageUpload'),
    isDisabled: undefined
  },
  ...aiHandlers
} satisfies EditorCustomHandlers

const { items: emojiItems } = useEditorEmojis()
const { items: mentionItems } = useEditorMentions(ref([]))
const { items: suggestionItems } = useEditorSuggestions(customHandlers)
const { items: toolbarItems, getImageToolbarItems } = useEditorToolbar(customHandlers, { aiLoading })

const extensions = computed(() => [
  Emoji,
  ImageUpload,
  completionExtension
])

const body = ref(props.issue.body || '')
const isEditing = ref(false)
const isSaving = ref(false)

watch(() => props.issue.body, (newBody) => {
  body.value = newBody || ''
})

async function saveBody() {
  isSaving.value = true

  try {
    const [owner, repo] = props.issue.repository!.fullName.split('/')
    await $fetch(`/api/issues/${props.issue.id}/body`, {
      method: 'PATCH',
      body: { body: body.value, owner, repo, issueNumber: props.issue.number }
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
</script>

<template>
  <UEditor
    v-slot="{ editor }"
    ref="editorRef"
    v-model="body"
    :handlers="customHandlers"
    :extensions="extensions"
    content-type="markdown"
    placeholder="Add a description..."
    :ui="{ base: 'sm:px-0 pb-12' }"
  >
    <UEditorToolbar
      :editor="editor"
      :items="toolbarItems"
      layout="bubble"
      :should-show="({ editor, view, state }: any) => {
        if (editor.isActive('imageUpload') || editor.isActive('image')) {
          return false
        }
        const { selection } = state
        return view.hasFocus() && !selection.empty
      }"
    >
      <template #link>
        <EditorLinkPopover :editor="editor" />
      </template>
    </UEditorToolbar>

    <UEditorToolbar
      :editor="editor"
      :items="getImageToolbarItems(editor)"
      layout="bubble"
      :should-show="({ editor, view }: any) => {
        return editor.isActive('image') && view.hasFocus()
      }"
    />

    <UEditorEmojiMenu
      :editor="editor"
      :items="emojiItems"
    />
    <UEditorMentionMenu
      :editor="editor"
      :items="mentionItems"
    />
    <UEditorSuggestionMenu
      :editor="editor"
      :items="suggestionItems"
    />
  </UEditor>
</template>
