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

// Group repositories by owner
const repositoriesByOwner = computed(() => {
  if (!repositories.value) return []

  const grouped = repositories.value.reduce((acc, repo) => {
    const owner = repo.fullName.split('/')[0]!
    if (!acc[owner]) {
      acc[owner] = []
    }
    acc[owner]!.push(repo)
    return acc
  }, {} as Record<string, RepositoryWithSubscription[]>)

  return Object.entries(grouped).map(([owner, repos]) => ({
    label: owner,
    value: owner,
    repositories: repos
  }))
})

// Update subscription preference
async function updateSubscription(fullName: string, updates: Partial<RepositorySubscription>) {
  const [owner, name] = fullName.split('/')

  loading.value = fullName

  try {
    await $fetch<RepositorySubscription>(`/api/repositories/${owner}/${name}/subscription`, {
      method: 'PATCH',
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
  participating: { issues: false, pullRequests: false, releases: true, ci: false, mentions: true, activity: true },
  all: { issues: true, pullRequests: true, releases: true, ci: true, mentions: true, activity: true },
  ignore: { issues: false, pullRequests: false, releases: false, ci: false, mentions: false, activity: false }
}

// Check which preset matches the current subscription
function getActivePreset(sub: RepositorySubscription): 'participating' | 'all' | 'ignore' | 'custom' {
  for (const [name, preset] of Object.entries(presets)) {
    const matches = Object.entries(preset).every(([key, value]) => sub[key as keyof typeof preset] === value)
    if (matches) {
      return name as 'participating' | 'all' | 'ignore'
    }
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
      icon: 'i-lucide-users',
      checked: activePreset === 'participating',
      onSelect: () => updateSubscription(repo.fullName, presets.participating)
    },
    {
      type: 'checkbox',
      label: 'All activity',
      description: 'Receive notifications for all activity in the repository.',
      icon: 'i-lucide-activity',
      checked: activePreset === 'all',
      onSelect: () => updateSubscription(repo.fullName, presets.all)
    },
    {
      type: 'checkbox',
      label: 'Ignore',
      description: 'Receive no notifications for this repository.',
      icon: 'i-lucide-eye-off',
      checked: activePreset === 'ignore',
      onSelect: () => updateSubscription(repo.fullName, presets.ignore)
    },
    {
      type: 'checkbox',
      label: 'Custom',
      description: 'Receive notifications for specific activity in the repository.',
      icon: 'i-lucide-settings',
      checked: activePreset === 'custom',
      children: [[
        {
          type: 'checkbox',
          label: 'Issues',
          description: 'Receive notifications for new issues.',
          icon: 'i-octicon-issue-opened-24',
          checked: sub.issues,
          onUpdateChecked: (checked: boolean) => updateSubscription(repo.fullName, { issues: checked })
        },
        {
          type: 'checkbox',
          label: 'Pull requests',
          description: 'Receive notifications for new pull requests.',
          icon: 'i-octicon-git-pull-request-24',
          checked: sub.pullRequests,
          onUpdateChecked: (checked: boolean) => updateSubscription(repo.fullName, { pullRequests: checked })
        },
        {
          type: 'checkbox',
          label: 'Releases',
          description: 'Receive notifications for new releases.',
          icon: 'i-octicon-tag-24',
          checked: sub.releases,
          onUpdateChecked: (checked: boolean) => updateSubscription(repo.fullName, { releases: checked })
        },
        {
          type: 'checkbox',
          label: 'CI failures',
          description: 'Receive notifications for CI failures.',
          icon: 'i-octicon-x-circle-24',
          checked: sub.ci,
          onUpdateChecked: (checked: boolean) => updateSubscription(repo.fullName, { ci: checked })
        },
        {
          type: 'checkbox',
          label: 'Mentions',
          description: 'Receive notifications for @mentions.',
          icon: 'i-octicon-mention-24',
          checked: sub.mentions,
          onUpdateChecked: (checked: boolean) => updateSubscription(repo.fullName, { mentions: checked })
        },
        {
          type: 'checkbox',
          label: 'Activities',
          description: 'Receive notifications for activity on subscribed issues.',
          icon: 'i-octicon-bell-24',
          checked: sub.activity,
          onUpdateChecked: (checked: boolean) => updateSubscription(repo.fullName, { activity: checked })
        }
      ]]
    }
  ]]
}

// Get summary of active notifications for a repo
function getSubscriptionSummary(repo: RepositoryWithSubscription): { label: string, description: string, icon: string } {
  const preset = getActivePreset(repo.subscription)
  const sub = repo.subscription

  switch (preset) {
    case 'participating':
      return { label: 'Participating', description: 'Participating and @mentions', icon: 'i-lucide-users' }
    case 'all':
      return { label: 'All', description: 'All activity', icon: 'i-lucide-activity' }
    case 'ignore':
      return { label: 'Ignore', description: 'Ignoring all notifications', icon: 'i-lucide-eye-off' }
    case 'custom': {
      const enabled = [
        sub.issues && 'Issues',
        sub.pullRequests && 'PRs',
        sub.releases && 'Releases',
        sub.ci && 'CI',
        sub.mentions && 'Mentions',
        sub.activity && 'Activity'
      ].filter(Boolean)
      return { label: 'Custom', description: enabled.join(', ') || 'None', icon: 'i-lucide-settings' }
    }
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
      <UAccordion
        v-if="repositoriesByOwner.length"
        :items="repositoriesByOwner"
        :ui="{
          item: 'group',
          header: 'sticky top-0 bg-elevated/25 hover:bg-elevated/50 backdrop-blur-xl z-1 transition-colors',
          trigger: 'px-4 py-3 gap-3',
          body: 'pb-0 divide-y divide-default border-t border-default'
        }"
      >
        <template #leading="{ item }">
          <UAvatar
            :src="`https://github.com/${item.label}.png`"
            :alt="item.label"
            class="rounded-md"
          />
        </template>

        <template #default="{ item }">
          <div class="flex-1 text-left">
            <p class="text-sm font-medium">
              {{ item.label }}
            </p>
            <p class="text-sm text-muted font-normal">
              {{ item.repositories.length }} {{ item.repositories.length === 1 ? 'repository' : 'repositories' }}
            </p>
          </div>
        </template>

        <template #body="{ item }">
          <div
            v-for="repo in item.repositories"
            :key="repo.id"
            class="flex items-center justify-between py-3 px-4 bg-default"
          >
            <div class="flex items-center gap-3 min-w-0">
              <UAvatar :icon="repo.private ? 'i-lucide-lock' : 'i-lucide-book'" />
              <div class="min-w-0">
                <p class="font-medium text-sm truncate">
                  <NuxtLink :to="`https://github.com/${repo.fullName}`" target="_blank">
                    {{ repo.name }}
                  </NuxtLink>
                </p>
                <p class="text-sm text-muted truncate">
                  {{ getSubscriptionSummary(repo).description }}
                </p>
              </div>
            </div>

            <UDropdownMenu
              :items="getDropdownItems(repo)"
              :content="{ align: 'end' }"
              :ui="{ content: 'w-72', itemDescription: 'text-clip' }"
            >
              <UButton
                color="neutral"
                variant="soft"
                size="sm"
                :icon="getSubscriptionSummary(repo).icon"
                trailing-icon="i-lucide-chevron-down"
                :loading="loading === repo.fullName"
              >
                {{ getSubscriptionSummary(repo).label }}
              </UButton>
            </UDropdownMenu>
          </div>

          <div v-if="!item.repositories.length" class="text-center py-8 text-muted">
            No repositories
          </div>
        </template>
      </UAccordion>

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
