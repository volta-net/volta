import type { EditorMentionMenuItem } from '@nuxt/ui'

export function useEditorMentions(users: Ref<any[]>) {
  const items = computed<EditorMentionMenuItem[]>(() => {
    return users.value.map(user => ({
      label: user.name,
      avatar: {
        alt: user.name,
        style: { color: user.color }
      }
    }))
  })

  return {
    items
  }
}
