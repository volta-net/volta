import type { DropdownMenuItem } from '@nuxt/ui'
import type { IssueDetail } from '#shared/types'

interface CodingToolDef {
  id: string
  label: string
  icon: string
  type: 'deeplink' | 'web' | 'copy'
  buildUrl?: (prompt: string) => string
}

const STORAGE_KEY = 'volta-coding-tools-usage'

const tools: CodingToolDef[] = [
  {
    id: 'cursor',
    label: 'Cursor',
    icon: 'i-simple-icons-cursor',
    type: 'deeplink',
    buildUrl: prompt => `cursor://anysphere.cursor-deeplink/prompt?text=${encodeURIComponent(prompt)}`
  },
  {
    id: 'windsurf',
    label: 'Windsurf',
    icon: 'i-simple-icons-codeium',
    type: 'deeplink',
    buildUrl: prompt => `windsurf://cascade/newChat?prompt=${encodeURIComponent(prompt)}`
  },
  {
    id: 'github-copilot',
    label: 'GitHub Copilot',
    icon: 'i-simple-icons-githubcopilot',
    type: 'deeplink',
    buildUrl: prompt => `vscode://github.copilot-chat?prompt=${encodeURIComponent(prompt)}`
  },
  {
    id: 'v0',
    label: 'v0',
    icon: 'i-simple-icons-v0',
    type: 'web',
    buildUrl: prompt => `https://v0.dev/chat/api/open?prompt=${encodeURIComponent(prompt.slice(0, 500))}`
  },
  {
    id: 'lovable',
    label: 'Lovable',
    icon: 'i-lucide-heart',
    type: 'web',
    buildUrl: prompt => `https://lovable.dev/?autosubmit=true#prompt=${encodeURIComponent(prompt)}`
  },
  {
    id: 'replit',
    label: 'Replit',
    icon: 'i-simple-icons-replit',
    type: 'copy'
  },
  {
    id: 'zed',
    label: 'Zed',
    icon: 'i-simple-icons-zedindustries',
    type: 'copy'
  },
  {
    id: 'claude-code',
    label: 'Claude Code',
    icon: 'i-simple-icons-claude',
    type: 'copy'
  },
  {
    id: 'amp',
    label: 'Amp',
    icon: 'i-lucide-terminal',
    type: 'copy'
  },
  {
    id: 'codex-cli',
    label: 'Codex CLI',
    icon: 'i-simple-icons-openai',
    type: 'copy'
  },
  {
    id: 'codex-desktop',
    label: 'Codex Desktop',
    icon: 'i-simple-icons-openai',
    type: 'copy'
  },
  {
    id: 'conductor',
    label: 'Conductor',
    icon: 'i-lucide-bot',
    type: 'copy'
  },
  {
    id: 'devin',
    label: 'Devin',
    icon: 'i-lucide-bot',
    type: 'copy'
  },
  {
    id: 'factory',
    label: 'Factory',
    icon: 'i-lucide-bot',
    type: 'copy'
  },
  {
    id: 'opencode',
    label: 'OpenCode',
    icon: 'i-lucide-terminal',
    type: 'copy'
  },
  {
    id: 'warp',
    label: 'Warp',
    icon: 'i-lucide-terminal',
    type: 'copy'
  },
  {
    id: 'netlify-agent-runners',
    label: 'Netlify Agent Runners',
    icon: 'i-simple-icons-netlify',
    type: 'copy'
  }
]

function getUsage(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

function incrementUsage(toolId: string) {
  const usage = getUsage()
  usage[toolId] = (usage[toolId] || 0) + 1
  localStorage.setItem(STORAGE_KEY, JSON.stringify(usage))
}

function buildPrompt(issue: IssueDetail): string {
  const repo = issue.repository?.fullName ?? ''
  const labels = issue.labels?.map(l => l.name).join(', ')

  let prompt = `Work on GitHub issue ${repo}#${issue.number}:\n\n`
  prompt += `<issue identifier="${repo}#${issue.number}">\n`
  prompt += `<title>${issue.title}</title>\n`
  if (labels) {
    prompt += `<labels>${labels}</labels>\n`
  }
  prompt += `<description>\n${issue.body ?? 'No description provided.'}\n</description>\n`
  prompt += `</issue>`

  return prompt
}

function sortByUsage(defs: CodingToolDef[], usage: Record<string, number>): CodingToolDef[] {
  return [...defs].sort((a, b) => {
    const countDiff = (usage[b.id] || 0) - (usage[a.id] || 0)
    if (countDiff !== 0) return countDiff
    return a.label.localeCompare(b.label)
  })
}

export function useCodingTools(issue: Ref<IssueDetail>) {
  const toast = useToast()
  const { copy } = useClipboard()

  const usageCounts = ref(getUsage())

  function execute(def: CodingToolDef) {
    const prompt = buildPrompt(issue.value)

    incrementUsage(def.id)
    usageCounts.value = getUsage()

    if (def.buildUrl) {
      const url = def.buildUrl(prompt)
      window.open(url, def.type === 'web' ? '_blank' : '_self')
      toast.add({ title: `Opened in ${def.label}`, icon: def.icon })
    } else {
      copy(prompt)
      toast.add({ title: `Prompt copied for ${def.label}`, icon: 'i-lucide-copy' })
    }
  }

  const items = computed<DropdownMenuItem[][]>(() => {
    const sorted = sortByUsage(tools, usageCounts.value)
    return [sorted.map(def => ({
      label: def.label,
      icon: def.icon,
      trailingIcon: def.type === 'copy' ? 'i-lucide-clipboard' : def.type === 'web' ? 'i-lucide-external-link' : undefined,
      onSelect: () => execute(def)
    }))]
  })

  return { items }
}
