import type { EditorMentionMenuItem } from '@nuxt/ui'

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
