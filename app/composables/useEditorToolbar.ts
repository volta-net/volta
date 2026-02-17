import type { Ref } from 'vue'
import type { EditorToolbarItem, EditorCustomHandlers } from '@nuxt/ui'
import type { Editor } from '@tiptap/vue-3'
import { computed } from '#imports'

interface UseEditorToolbarOptions {
  aiLoading?: Ref<boolean | undefined>
  suggestReply?: boolean
}

export function useEditorToolbar<T extends EditorCustomHandlers>(_customHandlers?: T, options: UseEditorToolbarOptions = {}) {
  const { aiLoading, suggestReply } = options

  const items = computed(() => {
    const aiItems: any[] = [{
      kind: 'aiFix',
      icon: 'i-lucide-spell-check',
      label: 'Fix spelling & formatting'
    }, {
      kind: 'aiSimplify',
      icon: 'i-lucide-lightbulb',
      label: 'Simplify'
    }, {
      kind: 'aiSummarize',
      icon: 'i-lucide-list',
      label: 'Summarize'
    }, {
      kind: 'aiContinue',
      icon: 'i-lucide-text',
      label: 'Continue sentence'
    }, {
      icon: 'i-lucide-languages',
      label: 'Translate',
      children: [{
        kind: 'aiTranslate',
        language: 'English',
        label: 'English'
      }, {
        kind: 'aiTranslate',
        language: 'Chinese (Simplified)',
        label: 'Chinese (Simplified)'
      }, {
        kind: 'aiTranslate',
        language: 'Portuguese (Brazilian)',
        label: 'Portuguese'
      }, {
        kind: 'aiTranslate',
        language: 'Japanese',
        label: 'Japanese'
      }, {
        kind: 'aiTranslate',
        language: 'Korean',
        label: 'Korean'
      }, {
        kind: 'aiTranslate',
        language: 'French',
        label: 'French'
      }, {
        kind: 'aiTranslate',
        language: 'Spanish',
        label: 'Spanish'
      }, {
        kind: 'aiTranslate',
        language: 'German',
        label: 'German'
      }, {
        kind: 'aiTranslate',
        language: 'Russian',
        label: 'Russian'
      }]
    }]

    // Add "Suggest reply" options if enabled
    if (suggestReply) {
      aiItems.unshift({
        kind: 'aiSavoirReply',
        icon: 'i-lucide-book-open',
        label: 'Suggest reply (with Savoir)'
      }, {
        kind: 'aiReply',
        icon: 'i-lucide-reply',
        label: 'Suggest reply'
      })
    }

    return [[{
      label: 'Ask AI',
      icon: 'i-lucide-sparkles',
      trailingIcon: 'i-lucide-chevron-down',
      activeColor: 'neutral',
      activeVariant: 'ghost',
      loading: aiLoading?.value,
      ui: {
        base: 'group',
        trailingIcon: 'group-data-[state=open]:rotate-180 transition-transform duration-200'
      },
      content: {
        align: 'start'
      },
      items: aiItems
    }], [{
      label: 'Turn into',
      trailingIcon: 'i-lucide-chevron-down',
      activeColor: 'neutral',
      activeVariant: 'ghost',
      content: {
        align: 'start'
      },
      ui: {
        label: 'text-xs',
        base: 'group',
        trailingIcon: 'group-data-[state=open]:rotate-180 transition-transform duration-200'
      },
      items: [{
        type: 'label',
        label: 'Turn into'
      }, {
        kind: 'paragraph',
        label: 'Paragraph',
        icon: 'i-lucide-type'
      }, {
        kind: 'heading',
        level: 1,
        label: 'Heading 1',
        icon: 'i-lucide-heading-1'
      }, {
        kind: 'heading',
        level: 2,
        label: 'Heading 2',
        icon: 'i-lucide-heading-2'
      }, {
        kind: 'heading',
        level: 3,
        label: 'Heading 3',
        icon: 'i-lucide-heading-3'
      }, {
        kind: 'heading',
        level: 4,
        label: 'Heading 4',
        icon: 'i-lucide-heading-4'
      }, {
        kind: 'bulletList',
        label: 'Bullet List',
        icon: 'i-lucide-list'
      }, {
        kind: 'orderedList',
        label: 'Ordered List',
        icon: 'i-lucide-list-ordered'
      }, {
        kind: 'taskList',
        label: 'Task List',
        icon: 'i-lucide-list-check'
      }, {
        kind: 'blockquote',
        label: 'Blockquote',
        icon: 'i-lucide-text-quote'
      }, {
        kind: 'codeBlock',
        label: 'Code Block',
        icon: 'i-lucide-square-code'
      }]
    }], [{
      kind: 'mark',
      mark: 'bold',
      icon: 'i-lucide-bold',
      tooltip: { text: 'Bold' }
    }, {
      kind: 'mark',
      mark: 'italic',
      icon: 'i-lucide-italic',
      tooltip: { text: 'Italic' }
    }, {
      kind: 'mark',
      mark: 'underline',
      icon: 'i-lucide-underline',
      tooltip: { text: 'Underline' }
    }, {
      kind: 'mark',
      mark: 'strike',
      icon: 'i-lucide-strikethrough',
      tooltip: { text: 'Strikethrough' }
    }, {
      kind: 'mark',
      mark: 'code',
      icon: 'i-lucide-code',
      tooltip: { text: 'Code' }
    }], [{
      slot: 'link' as const,
      icon: 'i-lucide-link'
    }, {
      kind: 'imageUpload',
      icon: 'i-lucide-image',
      tooltip: { text: 'Image' }
    }]] as EditorToolbarItem<T>[][]
  })

  const getImageToolbarItems = (editor: Editor): EditorToolbarItem<T>[][] => {
    const node = editor.state.doc.nodeAt(editor.state.selection.from)

    return [[{
      icon: 'i-lucide-download',
      to: node?.attrs?.src,
      download: true,
      tooltip: { text: 'Download' }
    }, {
      icon: 'i-lucide-refresh-cw',
      tooltip: { text: 'Replace' },
      onClick: () => {
        const { state } = editor
        const { selection } = state

        const pos = selection.from
        const node = state.doc.nodeAt(pos)

        if (node && node.type.name === 'image') {
          editor.chain().focus().deleteRange({ from: pos, to: pos + node.nodeSize }).insertContentAt(pos, { type: 'imageUpload' }).run()
        }
      }
    }], [{
      icon: 'i-lucide-trash',
      tooltip: { text: 'Delete' },
      onClick: () => {
        const { state } = editor
        const { selection } = state

        const pos = selection.from
        const node = state.doc.nodeAt(pos)

        if (node && node.type.name === 'image') {
          editor.chain().focus().deleteRange({ from: pos, to: pos + node.nodeSize }).run()
        }
      }
    }]]
  }

  return {
    items,
    getImageToolbarItems
  }
}
