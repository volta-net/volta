import type { EditorMentionMenuItem } from '@nuxt/ui'
import { watchDebounced } from '@vueuse/core'

interface IssueReference {
  id: number
  number: number
  title: string
  state: string
  pullRequest: boolean
  repository: {
    id: number
    fullName: string
  }
}

// Extend EditorMentionMenuItem to include type attribute for mentions
interface ReferenceMenuItem extends EditorMentionMenuItem {
  type: 'reference'
}

interface UseEditorReferencesOptions {
  excludeNumber?: number
  repositoryFullName?: string
}

/**
 * Composable for async issue/PR references in the editor
 * Uses v-model:query and ignore-filter from UEditorMentionMenu
 */
export function useEditorReferences(options: UseEditorReferencesOptions = {}) {
  const query = ref('')
  const results = ref<IssueReference[]>([])

  // Watch query with debounce and fetch from API
  watchDebounced(query, async (q) => {
    if (!q) {
      results.value = []
      return
    }

    try {
      const response = await $fetch<IssueReference[]>('/api/issues/search', {
        query: {
          q,
          repo: options.repositoryFullName,
          limit: 20
        }
      })
      results.value = response || []
    } catch (error) {
      console.error('Failed to fetch references:', error)
      results.value = []
    }
  }, { debounce: 200 })

  // Items computed - only show results when we have query AND results
  const items = computed<ReferenceMenuItem[]>(() => {
    if (!query.value || !results.value.length) {
      return []
    }

    return results.value
      .filter(issue => issue.number !== options.excludeNumber)
      .map(issue => ({
        id: String(issue.number),
        label: `#${issue.number} ${issue.title}`,
        icon: issue.pullRequest ? 'i-lucide-git-pull-request' : 'i-lucide-circle-dot',
        type: 'reference' as const
      }))
  })

  return {
    query,
    items
  }
}
