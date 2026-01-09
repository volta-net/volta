import type { Editor as TiptapEditor } from '@tiptap/vue-3'
import type { EditorMentionMenuItem } from '@nuxt/ui'
import type { MentionOptions, MentionNodeAttrs } from '@tiptap/extension-mention'
import { mergeAttributes } from '@tiptap/core'
import { Mention } from '@tiptap/extension-mention'

export interface MentionUser {
  id: number
  login: string
  name?: string | null
  avatarUrl?: string | null
}

interface UseEditorMentionsOptions {
  collaborators?: Ref<MentionUser[]>
  author?: MentionUser | null
  commenters?: { user: MentionUser | null }[]
}

// Extend EditorMentionMenuItem to include type attribute for mentions
interface UserMentionMenuItem extends EditorMentionMenuItem {
  type: 'user'
}

/**
 * Determine if a mention ID is a reference (issue/PR) or user mention
 */
export function isReferenceType(id: string): boolean {
  if (/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+#\d+$/.test(id)) return true
  if (/^\d+$/.test(id)) return true
  return false
}

/**
 * Parse GitHub autolinked references in editor document
 * See: https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/autolinked-references-and-urls
 */
export function parseExistingMentions(editor: TiptapEditor, currentRepo: string) {
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
      // Exclude scoped npm packages like @nuxt/ui, @ai-sdk/mcp
      // Use negative lookahead to check if followed by any chars then / (package pattern)
      regex: /(?<![a-zA-Z0-9._%+-])@([a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)(?![^\s/]*\/)\b/g,
      getId: (m: RegExpExecArray) => m[1]!,
      type: 'user'
    }
  ]

  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return

    // Skip text nodes that are inside links (have link mark)
    if (node.marks.some(mark => mark.type.name === 'link')) return

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

/**
 * Create mention rendering options for TipTap Mention extension
 */
function createMentionOptions(repoFullName: Ref<string>): Partial<MentionOptions<any, MentionNodeAttrs>> {
  return {
    renderHTML({ options, node }) {
      const rawLabel = node.attrs.id ?? node.attrs.label
      // If no valid id/label, render as plain text with the suggestion char
      if (rawLabel == null) {
        const char = node.attrs.mentionSuggestionChar || '@'
        return ['span', options.HTMLAttributes, char]
      }
      const label = String(rawLabel)
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
      const rawLabel = node.attrs.id ?? node.attrs.label
      // If no valid id/label, return just the suggestion char
      if (rawLabel == null) {
        return node.attrs.mentionSuggestionChar || '@'
      }
      const label = String(rawLabel)
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
}

/**
 * Create custom Mention extension that disables markdown parsing to prevent
 * `@scope/package` patterns from being incorrectly parsed as mentions
 */
export function createCustomMentionExtension(repoFullName: Ref<string>) {
  const mentionOptions = createMentionOptions(repoFullName)

  return Mention.extend({
    // Override markdown parsing to skip parsing mentions from markdown shortcodes
    // We use parseExistingMentions instead for proper text-to-mention conversion
    parseMarkdown: () => [],
    markdownTokenizer: {
      name: 'mention',
      level: 'inline' as const,
      start: () => -1, // Never match
      tokenize: () => undefined
    },
    renderMarkdown(node: { attrs?: { id?: string, label?: string } }) {
      // Serialize mentions back to plain text format (@username or #number)
      const label = node.attrs?.id ?? node.attrs?.label
      if (!label) return ''
      if (isReferenceType(String(label))) {
        if (/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+#\d+$/.test(String(label))) {
          return String(label)
        }
        return `#${label}`
      }
      return `@${label}`
    },
    // Override HTML parsing to reject mentions without valid id/label
    parseHTML() {
      return [
        {
          tag: 'span[data-type="mention"]',
          getAttrs: (element) => {
            const el = element as HTMLElement
            const id = el.getAttribute('data-id')
            const label = el.getAttribute('data-label')
            // Only parse as mention if it has valid id or label
            if (!id && !label) {
              return false // Reject this match
            }
            return { id, label }
          }
        }
      ]
    }
  }).configure({
    ...mentionOptions,
    HTMLAttributes: {
      class: 'mention'
    }
  })
}

export function useEditorMentions(options: UseEditorMentionsOptions) {
  const items = computed<UserMentionMenuItem[]>(() => {
    const usersMap = new Map<number, MentionUser>()

    // Add collaborators
    for (const user of options.collaborators?.value ?? []) {
      usersMap.set(user.id, user)
    }

    // Add author
    if (options.author) {
      usersMap.set(options.author.id, options.author)
    }

    // Add commenters
    for (const comment of options.commenters ?? []) {
      if (comment.user) {
        usersMap.set(comment.user.id, comment.user)
      }
    }

    return Array.from(usersMap.values()).map(user => ({
      id: user.login,
      label: user.login,
      avatar: {
        src: user.avatarUrl || `https://github.com/${user.login}.png`,
        alt: user.name || user.login
      },
      type: 'user' as const
    }))
  })

  return {
    items
  }
}
