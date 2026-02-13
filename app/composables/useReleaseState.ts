import type { Ref } from 'vue'
import { computed } from '#imports'
import type { Release } from '#shared/types'

export type ReleaseStateLike = Pick<Release, 'draft' | 'prerelease'>

type ReleaseColor = 'info' | 'warning' | 'neutral'

interface ReleaseStateConfig {
  icon: string
  color: ReleaseColor
  label: string
}

const releaseStates: Record<string, ReleaseStateConfig> = {
  draft: {
    icon: 'i-lucide-tag',
    color: 'neutral',
    label: 'Draft'
  },
  prerelease: {
    icon: 'i-lucide-tag',
    color: 'warning',
    label: 'Pre-release'
  },
  published: {
    icon: 'i-lucide-tag',
    color: 'info',
    label: 'Published'
  }
}

// Derive state key from release properties
function getStateKey(release: ReleaseStateLike | null | undefined): string {
  if (!release) return 'published'
  if (release.draft) return 'draft'
  if (release.prerelease) return 'prerelease'
  return 'published'
}

// Get full state config
export function getReleaseState(release: ReleaseStateLike | null | undefined): ReleaseStateConfig {
  const key = getStateKey(release)
  return releaseStates[key]!
}

// Individual getters for convenience
export const getReleaseStateIcon = (release: ReleaseStateLike | null | undefined) => getReleaseState(release).icon
export const getReleaseStateColor = (release: ReleaseStateLike | null | undefined) => getReleaseState(release).color
export const getReleaseStateBadge = (release: ReleaseStateLike | null | undefined) => {
  const state = getReleaseState(release)
  return { label: state.label, color: state.color }
}

// Composable for reactive use
export function useReleaseState(release: Ref<ReleaseStateLike | null | undefined>) {
  const state = computed(() => getReleaseState(release.value))

  return {
    state,
    icon: computed(() => state.value.icon),
    color: computed(() => state.value.color),
    label: computed(() => state.value.label)
  }
}
