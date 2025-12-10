import type { EditorToolbarItem } from '@nuxt/ui'

export function useEditorToolbar() {
  const items: EditorToolbarItem[][] = [[{
    kind: 'mark',
    mark: 'bold',
    icon: 'i-lucide-bold'
  }, {
    kind: 'mark',
    mark: 'italic',
    icon: 'i-lucide-italic'
  }, {
    kind: 'mark',
    mark: 'code',
    icon: 'i-lucide-code'
  }], [{
    kind: 'bulletList',
    icon: 'i-lucide-list'
  }, {
    kind: 'orderedList',
    icon: 'i-lucide-list-ordered'
  }], [{
    kind: 'blockquote',
    icon: 'i-lucide-text-quote'
  }, {
    kind: 'codeBlock',
    icon: 'i-lucide-square-code'
  }]]

  return { items }
}
