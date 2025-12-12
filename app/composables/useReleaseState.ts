import type { DBRelease } from '#shared/types/db'

export type ReleaseStateLike = Pick<DBRelease, 'draft' | 'prerelease'>

type BadgeColor = 'success' | 'info' | 'neutral'

interface ReleaseStateConfig {
  icon: string
  color: string
  label: string
  badgeColor: BadgeColor
}

const releaseStates: Record<string, ReleaseStateConfig> = {
  draft: {
    icon: 'i-octicon-tag-16',
    color: 'text-neutral-500 dark:text-neutral-400',
    label: 'Draft',
    badgeColor: 'neutral'
  },
  prerelease: {
    icon: 'i-octicon-tag-16',
    color: 'text-yellow-500 dark:text-yellow-400',
    label: 'Pre-release',
    badgeColor: 'info'
  },
  published: {
    icon: 'i-octicon-tag-16',
    color: 'text-blue-500 dark:text-blue-400',
    label: 'Published',
    badgeColor: 'success'
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
  return { label: state.label, color: state.badgeColor }
}

// Composable for reactive use
export function useReleaseState(release: Ref<ReleaseStateLike | null | undefined>) {
  const state = computed(() => getReleaseState(release.value))

  return {
    state,
    icon: computed(() => state.value.icon),
    color: computed(() => state.value.color),
    label: computed(() => state.value.label),
    badgeColor: computed(() => state.value.badgeColor)
  }
}
