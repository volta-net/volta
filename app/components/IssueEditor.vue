<script setup lang="ts">
import type { Editor as TiptapEditor } from '@tiptap/vue-3'
import type { EditorCustomHandlers } from '@nuxt/ui'
import type { MentionOptions, MentionNodeAttrs } from '@tiptap/extension-mention'
import { Details, DetailsContent, DetailsSummary } from '@tiptap/extension-details'
import { mergeAttributes } from '@tiptap/core'
import ImageUpload from '~/components/editor/ImageUpload'
import { Emoji } from '@tiptap/extension-emoji'
import type { MentionUser } from '~/composables/useEditorMentions'
import type { IssueDetail } from '#shared/types/issue'

/**
 * Determine if a mention ID is a reference (issue/PR) or user mention
 */
function isReferenceType(id: string): boolean {
  if (/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+#\d+$/.test(id)) return true
  if (/^\d+$/.test(id)) return true
  return false
}

/**
 * Parse GitHub autolinked references in editor document
 * See: https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/autolinked-references-and-urls
 */
function parseExistingMentions(editor: TiptapEditor, currentRepo: string) {
  const { state } = editor
  const { doc, schema } = state
  const mentionType = schema.nodes.mention
  if (!mentionType) return

  const replacements: { from: number, to: number, id: string, type: 'user' | 'reference' }[] = []

  const patterns: { regex: RegExp, getId: (m: RegExpExecArray) => string, type: 'user' | 'reference' }[] = [
    {
      regex: /https?:\/\/github\.com\/([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)\/(?:issues|pull)\/(\d+)/g,
      getId: (m: RegExpExecArray) => m[1] === currentRepo ? m[2]! : `${m[1]}#${m[2]}`,
      type: 'reference'
    },
    {
      regex: /([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)#(\d+)/g,
      getId: (m: RegExpExecArray) => `${m[1]}#${m[2]}`,
      type: 'reference'
    },
    {
      regex: /\bGH-(\d+)\b/gi,
      getId: (m: RegExpExecArray) => m[1]!,
      type: 'reference'
    },
    {
      regex: /(?<![/])#(\d+)\b/g,
      getId: (m: RegExpExecArray) => m[1]!,
      type: 'reference'
    },
    {
      regex: /(?<![a-zA-Z0-9._%+-])@([a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)\b/g,
      getId: (m: RegExpExecArray) => m[1]!,
      type: 'user'
    }
  ]

  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return

    const text = node.text

    for (const { regex, getId, type } of patterns) {
      regex.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = regex.exec(text)) !== null) {
        const from = pos + match.index
        const to = from + match[0].length

        if (!replacements.some(r => (from >= r.from && from < r.to) || (to > r.from && to <= r.to))) {
          replacements.push({ from, to, id: getId(match), type })
        }
      }
    }
  })

  if (replacements.length === 0) return

  const tr = state.tr
  replacements
    .sort((a, b) => b.from - a.from)
    .forEach(({ from, to, id, type }) => {
      const mentionNode = mentionType.create({ id, label: id, type })
      tr.replaceWith(from, to, mentionNode)
    })

  editor.view.dispatch(tr)
}

interface IssueReference {
  id: number
  number: number
  title: string
  state: string
  pullRequest: boolean
}

const props = withDefaults(defineProps<{
  modelValue: string
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
}>(), {
  placeholder: 'Write something...',
  collaborators: () => [],
  repositoryIssues: () => [],
  completion: false,
  parseMentions: false,
  bubbleToolbar: true
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'parsing', isParsing: boolean): void
}>()

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
const { items: toolbarItems, getImageToolbarItems } = useEditorToolbar(customHandlers.value, { aiLoading })

// Mention rendering
const mentionOptions: Partial<MentionOptions<any, MentionNodeAttrs>> = {
  renderHTML({ options, node }) {
    const label = String(node.attrs.id ?? node.attrs.label)
    const mentionType = isReferenceType(label) ? 'reference' : 'user'

    const crossRepoMatch = label.match(/^([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)#(\d+)$/)

    let href: string
    let displayText: string

    if (crossRepoMatch) {
      const [, repo, number] = crossRepoMatch
      href = `https://github.com/${repo}/issues/${number}`
      displayText = label
    } else if (mentionType === 'reference') {
      href = `https://github.com/${repoFullName.value}/issues/${label}`
      displayText = `#${label}`
    } else {
      href = `https://github.com/${label}`
      displayText = `@${label}`
    }

    return [
      'a',
      mergeAttributes(
        { href, target: '_blank', rel: 'noopener noreferrer' },
        options.HTMLAttributes
      ),
      displayText
    ]
  },
  renderText({ node }) {
    const label = String(node.attrs.id ?? node.attrs.label)
    const mentionType = isReferenceType(label) ? 'reference' : 'user'
    if (/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+#\d+$/.test(label)) {
      return label
    }
    if (mentionType === 'reference') {
      return `#${label}`
    }
    return `@${label}`
  }
}

// Extensions
const extensions = computed(() => {
  const ext = [
    Emoji,
    ImageUpload,
    Details.configure({
      HTMLAttributes: {
        class: 'details'
      }
    }),
    DetailsSummary,
    DetailsContent
  ]
  if (completionEnabled.value) {
    ext.push(Completion as any)
  }
  return ext
})

/**
 * Fix <details> HTML blocks in markdown by removing blank lines that break parsing.
 * Markdown parsers can interrupt HTML blocks on blank lines, causing content to escape.
 */
function fixDetailsBlocks(markdown: string): string {
  // Match <details> blocks and collapse internal blank lines to prevent parser interruption
  return markdown.replace(
    /<details([^>]*)>([\s\S]*?)<\/details>/gi,
    (match, attrs, innerContent) => {
      // Replace multiple newlines with single newline within the details block
      // This prevents the markdown parser from breaking out of the HTML block
      const fixedContent = innerContent
        .replace(/\n\s*\n/g, '\n') // Collapse blank lines to single newlines
        .trim()
      return `<details${attrs}>\n${fixedContent}\n</details>`
    }
  )
}

// Content model - fix details blocks on read
const content = computed({
  get: () => fixDetailsBlocks(props.modelValue),
  set: (value: string) => emit('update:modelValue', value)
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
    :mention="mentionOptions"
    content-type="markdown"
    :placeholder="placeholder"
    :ui="ui"
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
