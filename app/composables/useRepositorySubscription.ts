import type { Ref } from 'vue'
import type { DropdownMenuItem } from '@nuxt/ui'
import { ref, triggerRef, useToast } from '#imports'
import type { Installation, InstallationRepository, RepositorySubscription } from '#shared/types'

/**
 * Subscription preset configurations
 */
export const subscriptionPresets = {
  participating: { issues: false, pullRequests: false, releases: true, ci: false, mentions: true, activity: true },
  all: { issues: true, pullRequests: true, releases: true, ci: true, mentions: true, activity: true },
  ignore: { issues: false, pullRequests: false, releases: false, ci: false, mentions: false, activity: false }
} as const

export type SubscriptionPreset = keyof typeof subscriptionPresets | 'custom'

/**
 * Composable for managing repository notification subscriptions.
 */
export function useRepositorySubscription(installations: Ref<Installation[] | null | undefined>) {
  const toast = useToast()

  const updatingSubscription = ref<string | null>(null)

  /**
   * Update subscription preferences for a repository.
   * Creates a new subscription if one doesn't exist.
   * Uses optimistic updates for instant UI feedback.
   */
  function updateSubscription(repo: InstallationRepository, updates: Partial<RepositorySubscription>) {
    const [owner, name] = repo.fullName.split('/')

    // Store previous state for rollback
    const previousSubscription = repo.subscription ? { ...repo.subscription } : null

    // Optimistically update local state immediately
    if (repo.subscription) {
      Object.assign(repo.subscription, updates)
    } else {
      // Create optimistic subscription with defaults + updates
      repo.subscription = {
        issues: false,
        pullRequests: false,
        releases: false,
        ci: false,
        mentions: false,
        activity: false,
        ...updates
      } as RepositorySubscription
    }
    triggerRef(installations)

    // Persist to server in background
    $fetch<RepositorySubscription>(`/api/repositories/${owner}/${name}/subscription`, {
      method: 'PATCH',
      body: updates
    }).then((result) => {
      // Sync with server response (in case of computed fields like id)
      if (repo.subscription) {
        Object.assign(repo.subscription, result)
        triggerRef(installations)
      }
    }).catch((error: any) => {
      // Rollback on error
      if (previousSubscription) {
        Object.assign(repo.subscription!, previousSubscription)
      } else {
        repo.subscription = undefined
      }
      triggerRef(installations)

      toast.add({
        title: 'Failed to update subscription',
        description: error.data?.message || 'An error occurred',
        color: 'error'
      })
    })
  }

  /**
   * Determine which preset matches the current subscription settings.
   */
  function getActivePreset(sub: RepositorySubscription): SubscriptionPreset {
    for (const [name, preset] of Object.entries(subscriptionPresets)) {
      const matches = Object.entries(preset).every(
        ([key, value]) => sub[key as keyof typeof preset] === value
      )
      if (matches) {
        return name as keyof typeof subscriptionPresets
      }
    }
    return 'custom'
  }

  /**
   * Build dropdown menu items for notification settings.
   * Works with or without an existing subscription (defaults to "unsubscribed" state).
   */
  function getDropdownItems(repo: InstallationRepository): DropdownMenuItem[][] {
    // Default subscription state for repos without a subscription (not subscribed to anything)
    const defaultSub: RepositorySubscription = {
      issues: false,
      pullRequests: false,
      releases: false,
      ci: false,
      mentions: false,
      activity: false
    } as RepositorySubscription

    const sub = repo.subscription ?? defaultSub
    const activePreset = repo.subscription ? getActivePreset(sub) : 'ignore'

    return [[
      {
        label: 'Participating and @mentions',
        description: 'Releases, @mentions, and activity on subscribed issues.',
        icon: 'i-lucide-users',
        active: activePreset === 'participating',
        onSelect: (e) => {
          e.preventDefault()
          updateSubscription(repo, subscriptionPresets.participating)
        }
      },
      {
        label: 'All activity',
        description: 'All activity in the repository.',
        icon: 'i-lucide-activity',
        active: activePreset === 'all',
        onSelect: (e) => {
          e.preventDefault()
          updateSubscription(repo, subscriptionPresets.all)
        }
      },
      {
        label: 'Ignore',
        description: 'Receive no notifications.',
        icon: 'i-lucide-eye-off',
        active: activePreset === 'ignore',
        onSelect: (e) => {
          e.preventDefault()
          updateSubscription(repo, subscriptionPresets.ignore)
        }
      },
      {
        label: 'Custom',
        description: 'Choose specific activity types.',
        icon: 'i-lucide-settings',
        active: activePreset === 'custom',
        children: [[
          {
            type: 'checkbox',
            label: 'Issues',
            icon: 'i-lucide-circle-dot',
            checked: sub.issues,
            onUpdateChecked: (checked: boolean) => updateSubscription(repo, { issues: checked }),
            onSelect: (e: Event) => e.preventDefault()
          },
          {
            type: 'checkbox',
            label: 'Pull requests',
            icon: 'i-lucide-git-pull-request',
            checked: sub.pullRequests,
            onUpdateChecked: (checked: boolean) => updateSubscription(repo, { pullRequests: checked }),
            onSelect: (e: Event) => e.preventDefault()
          },
          {
            type: 'checkbox',
            label: 'Releases',
            icon: 'i-lucide-tag',
            checked: sub.releases,
            onUpdateChecked: (checked: boolean) => updateSubscription(repo, { releases: checked }),
            onSelect: (e: Event) => e.preventDefault()
          },
          {
            type: 'checkbox',
            label: 'CI failures',
            icon: 'i-lucide-circle-x',
            checked: sub.ci,
            onUpdateChecked: (checked: boolean) => updateSubscription(repo, { ci: checked }),
            onSelect: (e: Event) => e.preventDefault()
          },
          {
            type: 'checkbox',
            label: 'Mentions',
            icon: 'i-lucide-at-sign',
            checked: sub.mentions,
            onUpdateChecked: (checked: boolean) => updateSubscription(repo, { mentions: checked }),
            onSelect: (e: Event) => e.preventDefault()
          },
          {
            type: 'checkbox',
            label: 'Activities',
            icon: 'i-lucide-bell',
            checked: sub.activity,
            onUpdateChecked: (checked: boolean) => updateSubscription(repo, { activity: checked }),
            onSelect: (e: Event) => e.preventDefault()
          }
        ]]
      }
    ]]
  }

  /**
   * Get summary label and icon for the subscription button.
   */
  function getSummary(repo: InstallationRepository): { label: string, icon: string } {
    if (!repo.subscription) {
      return { label: 'Not subscribed', icon: 'i-lucide-bell-off' }
    }

    const preset = getActivePreset(repo.subscription)

    switch (preset) {
      case 'participating':
        return { label: 'Participating', icon: 'i-lucide-users' }
      case 'all':
        return { label: 'All', icon: 'i-lucide-activity' }
      case 'ignore':
        return { label: 'Ignore', icon: 'i-lucide-eye-off' }
      case 'custom':
        return { label: 'Custom', icon: 'i-lucide-settings' }
    }
  }

  /**
   * Check if a repository's subscription is being updated.
   */
  function isUpdating(fullName: string) {
    return updatingSubscription.value === fullName
  }

  return {
    updatingSubscription,
    updateSubscription,
    getActivePreset,
    getDropdownItems,
    getSummary,
    isUpdating
  }
}
