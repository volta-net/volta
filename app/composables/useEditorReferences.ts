import type { EditorMentionMenuItem } from '@nuxt/ui'

interface IssueReference {
  id: number
  number: number
  title: string
  state: string
  pullRequest: boolean
}

interface UseEditorReferencesOptions {
  excludeNumber?: number
}

// Extend EditorMentionMenuItem to include type attribute for mentions
interface ReferenceMenuItem extends EditorMentionMenuItem {
  type: 'reference'
}

export function useEditorReferences(issues: Ref<IssueReference[]>, options: UseEditorReferencesOptions = {}) {
  const items = computed<ReferenceMenuItem[]>(() => {
    return issues.value
      .filter(issue => issue.number !== options.excludeNumber)
      .map(issue => ({
        id: String(issue.number),
        label: `#${issue.number} ${issue.title}`,
        icon: issue.pullRequest ? 'i-lucide-git-pull-request' : 'i-lucide-circle-dot',
        type: 'reference' as const
      }))
  })

  return {
    items
  }
}
