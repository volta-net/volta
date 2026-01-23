export type AgentMode = 'labels' | 'title' | 'duplicates'

export interface LabelSuggestion {
  id: number
  name: string
  color: string
  reason: string
  action: 'add' | 'remove'
}

export interface TitleSuggestion {
  title: string
  reason: string
}

export interface DuplicateSuggestion {
  id: number
  number: number
  title: string
  state: string
  htmlUrl: string | null
  reason: string
}

export type AgentResult
  = | { mode: 'labels', suggestions: LabelSuggestion[] }
    | { mode: 'title', title: string, reason: string }
    | { mode: 'duplicates', duplicates: DuplicateSuggestion[] }

export function useAgentActions(issue: Ref<IssueDetail | null | undefined>) {
  const isOpen = ref(false)
  const mode = ref<AgentMode | null>(null)
  const result = ref<AgentResult | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // Computed API URL based on issue
  const apiUrl = computed(() => {
    if (!issue.value?.repository?.fullName || !issue.value?.number) return null
    const [owner, name] = issue.value.repository.fullName.split('/')
    return `/api/repositories/${owner}/${name}/issues/${issue.value.number}/suggest`
  })

  async function suggest(m: AgentMode) {
    if (!apiUrl.value) return

    // Reset state
    mode.value = m
    result.value = null
    error.value = null
    isLoading.value = true
    isOpen.value = true

    try {
      const response = await $fetch<
        | { suggestions: LabelSuggestion[] }
        | { title: string, reason: string }
        | { duplicates: DuplicateSuggestion[] }
      >(apiUrl.value, {
        method: 'POST',
        body: { mode: m }
      })

      // Type the result based on mode
      if (m === 'labels' && 'suggestions' in response) {
        result.value = { mode: 'labels', suggestions: response.suggestions }
      } else if (m === 'title' && 'title' in response) {
        result.value = { mode: 'title', title: response.title, reason: response.reason }
      } else if (m === 'duplicates' && 'duplicates' in response) {
        result.value = { mode: 'duplicates', duplicates: response.duplicates }
      }
    } catch (err: any) {
      error.value = err.data?.message || err.message || 'An error occurred'
    } finally {
      isLoading.value = false
    }
  }

  function close() {
    isOpen.value = false
    // Reset state after modal closes
    setTimeout(() => {
      mode.value = null
      result.value = null
      error.value = null
    }, 200)
  }

  return {
    isOpen,
    mode,
    result,
    isLoading,
    error,
    suggest,
    close
  }
}
