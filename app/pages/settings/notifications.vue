<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { Repository, RepositorySubscription } from '#shared/types/repository'

type RepositoryWithSubscription = Repository & { subscription: RepositorySubscription }

const toast = useToast()
const { data: repositories, refresh } = await useFetch<RepositoryWithSubscription[]>('/api/repositories')

// Refresh data when window gains focus
const focused = useWindowFocus()
watch(focused, (isFocused) => {
  if (isFocused) {
    refresh()
  }
})

// Loading state
const loading = ref<string | null>(null)

// Update subscription preference
async function updateSubscription(fullName: string, updates: Partial<RepositorySubscription>) {
  loading.value = fullName
  try {
    await $fetch<RepositorySubscription>(`/api/repositories/${fullName}/subscription`, {
      method: 'PATCH' as const,
      body: updates
    })
    // Refresh to get updated data
    await refresh()
  } catch (error: any) {
    toast.add({
      title: 'Failed to update subscription',
      description: error.data?.message || 'An error occurred',
      color: 'error'
    })
  } finally {
    loading.value = null
  }
}

// Preset configurations
const presets = {
  participating: { issues: true, pullRequests: true, releases: true, ci: false, mentions: true, activity: false },
  all: { issues: true, pullRequests: true, releases: true, ci: true, mentions: true, activity: true },
  ignore: { issues: false, pullRequests: false, releases: false, ci: false, mentions: false, activity: false }
}

// Check which preset matches the current subscription
function getActivePreset(sub: RepositorySubscription): 'participating' | 'all' | 'ignore' | 'custom' {
  if (!sub.issues && !sub.pullRequests && !sub.releases && !sub.ci && !sub.mentions && !sub.activity) {
    return 'ignore'
  }
  if (sub.issues && sub.pullRequests && sub.releases && sub.ci && sub.mentions && sub.activity) {
    return 'all'
  }
  if (sub.issues && sub.pullRequests && sub.releases && !sub.ci && sub.mentions && !sub.activity) {
    return 'participating'
  }
  return 'custom'
}

// Build dropdown items for a repository
function getDropdownItems(repo: RepositoryWithSubscription): DropdownMenuItem[][] {
  const sub = repo.subscription
  const activePreset = getActivePreset(sub)

  return [[
    {
      type: 'checkbox',
      label: 'Participating and @mentions',
      description: 'Receive notifications for issues and pull requests you are participating in, and @mentions.',
      checked: activePreset === 'participating',
      onSelect: () => updateSubscription(repo.fullName, presets.participating)
    },
    {
      type: 'checkbox',
      label: 'All activity',
      description: 'Receive notifications for all activity in the repository.',
      checked: activePreset === 'all',
      onSelect: () => updateSubscription(repo.fullName, presets.all)
    },
    {
      type: 'checkbox',
      label: 'Ignore',
      description: 'Receive no notifications for this repository.',
      checked: activePreset === 'ignore',
      onSelect: () => updateSubscription(repo.fullName, presets.ignore)
    },
    {
      type: 'checkbox',
      label: 'Custom',
      description: 'Receive notifications for specific activity in the repository.',
      checked: activePreset === 'custom',
      children: [[
        {
          type: 'checkbox',
          label: 'Issues',
          description: 'Receive notifications for new issues.',
          checked: sub.issues,
          onUpdateChecked: (checked: boolean) => updateSubscription(repo.fullName, { issues: checked })
        },
        {
          type: 'checkbox',
          label: 'Pull requests',
          description: 'Receive notifications for new pull requests.',
          checked: sub.pullRequests,
          onUpdateChecked: (checked: boolean) => updateSubscription(repo.fullName, { pullRequests: checked })
        },
        {
          type: 'checkbox',
          label: 'Releases',
          description: 'Receive notifications for new releases.',
          checked: sub.releases,
          onUpdateChecked: (checked: boolean) => updateSubscription(repo.fullName, { releases: checked })
        },
        {
          type: 'checkbox',
          label: 'CI failures',
          description: 'Receive notifications for CI failures.',
          checked: sub.ci,
          onUpdateChecked: (checked: boolean) => updateSubscription(repo.fullName, { ci: checked })
        },
        {
          type: 'checkbox',
          label: '@mentions',
          description: 'Receive notifications for @mentions.',
          checked: sub.mentions,
          onUpdateChecked: (checked: boolean) => updateSubscription(repo.fullName, { mentions: checked })
        },
        {
          type: 'checkbox',
          label: 'Activities',
          description: 'Receive notifications for activity on subscribed issues.',
          checked: sub.activity,
          onUpdateChecked: (checked: boolean) => updateSubscription(repo.fullName, { activity: checked })
        }
      ]]
    }
  ]]
}

// Get summary of active notifications for a repo
function getSubscriptionSummary(repo: RepositoryWithSubscription): string {
  const preset = getActivePreset(repo.subscription)

  switch (preset) {
    case 'participating':
      return 'Participating and @mentions'
    case 'all':
      return 'All activity'
    case 'ignore':
      return 'Ignoring'
    case 'custom':
      return 'Custom'
  }
}
</script>

<template>
  <div class="flex flex-col flex-1 min-h-0">
    <UPageCard
      title="Repository notifications"
      description="Configure what notifications you receive for each repository."
      variant="naked"
      orientation="horizontal"
      class="mb-4"
      :ui="{ title: 'leading-7', container: 'flex! flex-row! gap-0! items-start!' }"
    />

    <UCard
      class="max-h-full overflow-y-auto"
      :ui="{
        body: 'p-0 sm:p-0'
      }"
    >
      <div v-if="repositories?.length" class="divide-y divide-default">
        <div
          v-for="repo in repositories"
          :key="repo.id"
          class="flex items-center justify-between py-3 px-4"
        >
          <div class="flex items-center gap-3 min-w-0">
            <UAvatar
              :icon="repo.private ? 'i-lucide-lock' : 'i-lucide-book'"
            />
            <div class="min-w-0">
              <p class="font-medium text-sm truncate flex items-center gap-2">
                <NuxtLink :to="`https://github.com/${repo.fullName}`" target="_blank">
                  {{ repo.fullName }}
                </NuxtLink>
              </p>
              <p class="text-sm text-muted truncate">
                {{ getSubscriptionSummary(repo) }}
              </p>
            </div>
          </div>

          <UDropdownMenu
            :items="getDropdownItems(repo)"
            :content="{ align: 'end' }"
            :ui="{ content: 'w-64', itemDescription: 'line-clamp-3 text-clip' }"
          >
            <UButton
              color="neutral"
              variant="soft"
              size="sm"
              icon="i-lucide-bell"
              trailing-icon="i-lucide-chevron-down"
              :loading="loading === repo.fullName"
            >
              Customize
            </UButton>
          </UDropdownMenu>
        </div>
      </div>

      <UAlert
        v-else
        title="No repositories"
        description="Sync repositories from the Integrations tab to configure their notification settings."
        color="neutral"
        variant="soft"
      />
    </UCard>
  </div>
</template>
