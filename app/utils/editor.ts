import { Node } from '@tiptap/core'

/**
 * Helper for inline markdown parsing
 */
function parseInline(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
}

/**
 * Basic markdown to HTML renderer
 */
function renderBasicMarkdown(content: string): string {
  const lines = content.split('\n')
  const htmlParts: string[] = []
  let inList = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      if (inList) {
        htmlParts.push('</ul>')
        inList = false
      }
      continue
    }

    // Headings (check longer prefixes first)
    if (trimmed.startsWith('##### ')) {
      if (inList) {
        htmlParts.push('</ul>')
        inList = false
      }
      htmlParts.push(`<h5>${parseInline(trimmed.slice(6))}</h5>`)
    } else if (trimmed.startsWith('#### ')) {
      if (inList) {
        htmlParts.push('</ul>')
        inList = false
      }
      htmlParts.push(`<h4>${parseInline(trimmed.slice(5))}</h4>`)
    } else if (trimmed.startsWith('### ')) {
      if (inList) {
        htmlParts.push('</ul>')
        inList = false
      }
      htmlParts.push(`<h3>${parseInline(trimmed.slice(4))}</h3>`)
    } else if (trimmed.startsWith('## ')) {
      if (inList) {
        htmlParts.push('</ul>')
        inList = false
      }
      htmlParts.push(`<h2>${parseInline(trimmed.slice(3))}</h2>`)
    } else if (trimmed.startsWith('# ')) {
      if (inList) {
        htmlParts.push('</ul>')
        inList = false
      }
      htmlParts.push(`<h1>${parseInline(trimmed.slice(2))}</h1>`)
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      // List items
      if (!inList) {
        htmlParts.push('<ul>')
        inList = true
      }
      htmlParts.push(`<li>${parseInline(trimmed.slice(2))}</li>`)
    } else {
      // Regular paragraph
      if (inList) {
        htmlParts.push('</ul>')
        inList = false
      }
      htmlParts.push(`<p>${parseInline(trimmed)}</p>`)
    }
  }

  if (inList) {
    htmlParts.push('</ul>')
  }

  return htmlParts.join('')
}

/**
 * Markdown Content Utilities
 *
 * Pre-processes markdown content to handle edge cases that cause
 * rendering issues in the TipTap editor.
 */

// Details block regex and wrapper
const DETAILS_HTML_REGEX = /<details[^>]*>[\s\S]*?<\/details>/gi
const DETAILS_WRAPPER_REGEX = /<div data-details-encoded="([^"]+)"><\/div>/g

/**
 * Encode <details> blocks to wrapper divs before markdown parsing
 */
export function encodeDetailsBlocks(markdown: string): string {
  return markdown.replace(DETAILS_HTML_REGEX, (match) => {
    const encoded = btoa(unescape(encodeURIComponent(match)))
    return `<div data-details-encoded="${encoded}"></div>`
  })
}

/**
 * Decode wrapper divs back to <details> HTML
 */
export function decodeDetailsBlocks(markdown: string): string {
  return markdown.replace(DETAILS_WRAPPER_REGEX, (_, encoded) => {
    try {
      return decodeURIComponent(escape(atob(encoded)))
    } catch {
      return ''
    }
  })
}

/**
 * Pre-process content for editor display:
 * - Encode details blocks
 */
export function preprocessForEditor(markdown: string): string {
  return encodeDetailsBlocks(markdown)
}

/**
 * Post-process content from editor:
 * - Decode details blocks back to HTML
 */
export function postprocessFromEditor(markdown: string): string {
  return decodeDetailsBlocks(markdown)
}

/**
 * TipTap extension to render encoded details as collapsible HTML
 */
export const DetailsBlock = Node.create({
  name: 'detailsBlock',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      encoded: { default: '' }
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-details-encoded]',
        getAttrs: el => ({
          encoded: (el as HTMLElement).getAttribute('data-details-encoded')
        })
      }
    ]
  },

  renderHTML({ node }) {
    return ['div', { 'data-details-encoded': node.attrs.encoded }]
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('div')
      dom.className = 'details-block-wrapper'
      try {
        const rawHtml = decodeURIComponent(escape(atob(node.attrs.encoded)))

        // Parse the <details> structure and render markdown content
        const parser = new DOMParser()
        const doc = parser.parseFromString(rawHtml, 'text/html')
        const detailsEl = doc.querySelector('details')

        if (detailsEl) {
          const details = document.createElement('details')
          if (detailsEl.hasAttribute('open')) {
            details.setAttribute('open', '')
          }

          // Handle summary
          const summaryEl = detailsEl.querySelector('summary')
          if (summaryEl) {
            const summary = document.createElement('summary')
            summary.textContent = summaryEl.textContent || ''
            details.appendChild(summary)
          }

          // Handle content after summary - parse as markdown
          const contentDiv = document.createElement('div')
          contentDiv.className = 'details-content'

          // Get content after summary
          let content = detailsEl.innerHTML
          if (summaryEl) {
            content = content.replace(/<summary[^>]*>[\s\S]*?<\/summary>/i, '')
          }

          // Basic markdown rendering (fallback)
          contentDiv.innerHTML = renderBasicMarkdown(content.trim())

          details.appendChild(contentDiv)
          dom.appendChild(details)
        } else {
          dom.innerHTML = rawHtml
        }

        dom.contentEditable = 'false'
      } catch {
        dom.textContent = '[Invalid details block]'
      }
      return { dom }
    }
  },

  parseMarkdown() {
    return []
  },

  renderMarkdown(node: any) {
    // Output the placeholder div (will be decoded by postprocessFromEditor)
    return `<div data-details-encoded="${node.attrs.encoded}"></div>\n\n`
  }
})
