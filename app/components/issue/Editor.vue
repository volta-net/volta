<script setup lang="ts">
import type { Editor as TiptapEditor } from '@tiptap/vue-3'
import type { EditorCustomHandlers } from '@nuxt/ui'
import { Emoji } from '@tiptap/extension-emoji'
import { TableKit } from '@tiptap/extension-table'
import { TaskList, TaskItem } from '@tiptap/extension-list'
import CodeBlockShiki from 'tiptap-extension-code-block-shiki'
import { ImageUpload } from '~/components/editor/ImageUploadExtension'
import { createCustomMentionExtension, parseExistingMentions, type MentionUser } from '~/composables/useEditorMentions'
import { DetailsBlock, preprocessForEditor, postprocessFromEditor } from '~/utils/editor'

interface IssueReference {
  id: number
  number: number
  title: string
  state: string
  pullRequest: boolean
}

const props = withDefaults(defineProps<{
  issue: IssueDetail
  // External data (fetched by parent)
  collaborators?: MentionUser[]
  repositoryIssues?: IssueReference[]
  // UI
  placeholder?: string
  ui?: Record<string, string>
  // Features
  completion?: boolean
  parseMentions?: boolean
  bubbleToolbar?: boolean
  // AI Suggest Reply (only for comment forms)
  suggestReply?: boolean
}>(), {
  placeholder: 'Write something...',
  collaborators: () => [],
  repositoryIssues: () => [],
  completion: true,
  parseMentions: true,
  bubbleToolbar: true,
  suggestReply: false
})

const emit = defineEmits<{
  (e: 'parsing', isParsing: boolean): void
  (e: 'blur'): void
}>()

const modelValue = defineModel<string>()

// Internal content with preprocessing for proper display
const content = computed({
  get: () => preprocessForEditor(modelValue.value || ''),
  set: (val) => {
    modelValue.value = postprocessFromEditor(val || '')
  }
})

// Computed from issue
const repoFullName = computed(() => props.issue.repository.fullName)
const completionApi = computed(() =>
  props.completion ? `/api/repositories/${repoFullName.value}/issues/${props.issue.number}/completion` : undefined
)

const editorRef = useTemplateRef('editorRef')

defineExpose({
  editor: computed(() => editorRef.value?.editor)
})

// AI completion
const completionEnabled = computed(() => !!completionApi.value)
const {
  extension: Completion,
  handlers: aiHandlers,
  isLoading: aiLoading
} = useEditorCompletion(editorRef, {
  api: completionApi.value
})

// Custom handlers
const customHandlers = computed(() => {
  const handlers: EditorCustomHandlers = {
    imageUpload: {
      canExecute: (editor: TiptapEditor) => editor.can().insertContent({ type: 'imageUpload' }),
      execute: (editor: TiptapEditor) => editor.chain().focus().insertContent({ type: 'imageUpload' }),
      isActive: (editor: TiptapEditor) => editor.isActive('imageUpload'),
      isDisabled: undefined
    }
  }

  if (completionEnabled.value) {
    Object.assign(handlers, aiHandlers)
  }

  return handlers
})

// Mention items (from collaborators, author, commenters)
const collaboratorsRef = computed(() => props.collaborators)
const { items: emojiItems } = useEditorEmojis()
const { items: mentionItems } = useEditorMentions({
  collaborators: collaboratorsRef,
  author: props.issue.user,
  commenters: props.issue.comments
})

// Reference items (from repository issues, excluding current)
const issuesRef = computed(() => props.repositoryIssues)
const { items: referenceItems } = useEditorReferences(issuesRef, {
  excludeNumber: props.issue.number
})

const { items: suggestionItems } = useEditorSuggestions(customHandlers.value)
const { items: toolbarItems, getImageToolbarItems } = useEditorToolbar(customHandlers.value, {
  aiLoading,
  suggestReply: props.suggestReply
})

// Custom Mention extension (configured with repo context for proper link generation)
const CustomMention = createCustomMentionExtension(repoFullName)

// Extensions
const extensions = computed(() => {
  const ext = [
    CodeBlockShiki.configure({
      defaultTheme: 'material-theme',
      themes: {
        light: 'material-theme-lighter',
        dark: 'material-theme-palenight'
      }
    }),
    DetailsBlock,
    Emoji,
    ImageUpload,
    TableKit.configure({
      table: {
        resizable: true
      }
    }),
    TaskList,
    TaskItem,
    CustomMention
  ]
  if (completionEnabled.value) {
    ext.push(Completion as any)
  }
  return ext
})

const isParsing = ref(false)

// Parse existing mentions when editor becomes available
watch(editorRef, (ref) => {
  if (!props.parseMentions) return

  const editor = ref?.editor
  if (editor) {
    isParsing.value = true
    emit('parsing', true)
    setTimeout(() => {
      parseExistingMentions(editor, repoFullName.value)
      setTimeout(() => {
        isParsing.value = false
        emit('parsing', false)
      }, 100)
    }, 50)
  }
}, { immediate: true })

const appendToBody = import.meta.client ? () => document.body : undefined
</script>

<template>
  <UEditor
    v-slot="{ editor }"
    ref="editorRef"
    v-model="content"
    :handlers="customHandlers"
    :extensions="extensions"
    :starter-kit="{
      link: {
        openOnClick: true
      }
    }"
    :mention="false"
    content-type="markdown"
    :placeholder="{
      placeholder,
      mode: 'firstLine'
    }"
    :ui="ui"
    @blur="emit('blur')"
  >
    <!-- Bubble toolbar for text selection -->
    <UEditorToolbar
      v-if="bubbleToolbar"
      :editor="editor"
      :items="toolbarItems"
      layout="bubble"
      :should-show="({ editor: e, view, state }: any) => {
        if (e.isActive('imageUpload') || e.isActive('image')) {
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

    <!-- Inline toolbar (slot for custom positioning) -->
    <slot name="toolbar" :editor="editor" :items="toolbarItems" />

    <!-- Image toolbar -->
    <UEditorToolbar
      :editor="editor"
      :items="getImageToolbarItems(editor)"
      layout="bubble"
      :should-show="({ editor: e, view }: any) => {
        return e.isActive('image') && view.hasFocus()
      }"
    />

    <!-- Menus -->
    <UEditorEmojiMenu
      :editor="editor"
      :items="emojiItems"
      :append-to="appendToBody"
    />
    <UEditorMentionMenu
      :editor="editor"
      :items="mentionItems"
      plugin-key="mentionMenu"
      :append-to="appendToBody"
    />
    <UEditorMentionMenu
      :editor="editor"
      :items="referenceItems"
      char="#"
      plugin-key="referenceMenu"
      :append-to="appendToBody"
    />
    <UEditorSuggestionMenu
      :editor="editor"
      :items="suggestionItems"
      :append-to="appendToBody"
    />

    <!-- Default slot -->
    <slot :editor="editor" />
  </UEditor>
</template>
