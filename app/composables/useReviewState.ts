type ReviewStateLike = {
  pullRequest?: boolean
  reviews?: Array<{ state: string, user?: { id: number, login: string, name: string | null, avatarUrl: string | null } | null }>
  requestedReviewers?: Array<{ id: number }>
}

type ReviewStateLikeWithUsers = {
  pullRequest?: boolean
  reviews?: Array<{ state: string, user?: { id: number, login: string, name: string | null, avatarUrl: string | null } | null }>
  requestedReviewers?: Array<{ id: number, login: string, name: string | null, avatarUrl: string | null }>
}

export type ReviewColor = 'error' | 'success' | 'warning' | 'neutral'

interface ReviewStateConfig {
  icon: string
  color: ReviewColor
  label: string
}

export interface ReviewerWithState {
  id: number
  label: string
  login: string
  name: string | null
  avatarUrl: string | null
  color: ReviewColor | null
}

/**
 * Get color for a reviewer based on their review state
 */
export function getReviewerColor(state: string | null): ReviewColor | null {
  if (state === 'APPROVED') return 'success'
  if (state === 'CHANGES_REQUESTED') return 'error'
  if (state === 'COMMENTED' || state === 'DISMISSED') return 'neutral'
  return null
}

/**
 * Compute review state from an issue/PR
 * Works with both Issue (list) and IssueDetail (detail) data shapes
 */
export function useReviewState(issue: Ref<ReviewStateLike | null | undefined>) {
  return computed<ReviewStateConfig | null>(() => {
    const value = issue.value
    if (!value?.pullRequest) return null

    const reviews = value.reviews ?? []
    const hasRequestedReviewers = (value.requestedReviewers?.length ?? 0) > 0

    if (reviews.some(r => r.state === 'CHANGES_REQUESTED')) {
      return { icon: 'i-lucide-file-diff', color: 'error', label: 'Changes requested' }
    }
    if (reviews.some(r => r.state === 'APPROVED')) {
      return { icon: 'i-lucide-check', color: 'success', label: 'Approved' }
    }
    if (hasRequestedReviewers) {
      return { icon: 'i-lucide-eye', color: 'warning', label: 'Review required' }
    }
    return null
  })
}

type UserLike = { id: number, login: string, name: string | null, avatarUrl: string | null }

/**
 * Build list of all reviewers with their state (combines submitted reviews + pending requests)
 */
export function useReviewersWithState(issue: Ref<ReviewStateLikeWithUsers | null | undefined>) {
  return computed<ReviewerWithState[]>(() => {
    const value = issue.value
    if (!value) return []

    const result: ReviewerWithState[] = []
    const seenUserIds = new Set<number>()

    // Get latest review state per user
    const reviewsByUser = new Map<number, { user: UserLike, state: string }>()
    for (const review of value.reviews ?? []) {
      if (review.user?.id) {
        reviewsByUser.set(review.user.id, { user: review.user, state: review.state })
      }
    }

    // Add reviewers who have submitted reviews
    for (const [userId, { user, state }] of reviewsByUser) {
      seenUserIds.add(userId)
      result.push({
        id: userId,
        label: user.login,
        login: user.login,
        name: user.name,
        avatarUrl: user.avatarUrl,
        color: getReviewerColor(state)
      })
    }

    // Add pending reviewers
    for (const user of value.requestedReviewers ?? []) {
      if (!seenUserIds.has(user.id)) {
        result.push({
          id: user.id,
          label: user.login,
          login: user.login,
          name: user.name,
          avatarUrl: user.avatarUrl,
          color: 'warning'
        })
      }
    }

    return result
  })
}
