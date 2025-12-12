<script setup lang="ts">
import { triggerRef } from 'vue'
import type { DropdownMenuItem } from '@nuxt/ui'
import type { Installation, InstallationRepository } from '#shared/types/installation'
import type { RepositorySubscription } from '#shared/types/repository'

const toast = useToast()
const config = useRuntimeConfig().public

const { data: installations, refresh } = await useFetch<Installation[]>('/api/installations')

// Refresh data when window gains focus
const focused = useWindowFocus()
watch(focused, (isFocused) => {
  if (isFocused) {
    refresh()
  }
})

const syncing = ref<Set<string>>(new Set())
const deleting = ref<Set<string>>(new Set())
const updatingSubscription = ref<string | null>(null)
const updatingFavorite = ref<Set<number>>(new Set())

const { data: favoriteRepositories, refresh: refreshFavorites } = await useFetch('/api/favorites/repositories', {
  default: () => []
})

const favoriteRepoIds = computed(() => new Set(favoriteRepositories.value?.map(f => f.repositoryId) || []))

async function toggleFavorite(repositoryId: number) {
  updatingFavorite.value.add(repositoryId)

  try {
    if (favoriteRepoIds.value.has(repositoryId)) {
      await $fetch(`/api/favorites/repositories/${repositoryId}`, { method: 'DELETE' })
    } else {
      await $fetch('/api/favorites/repositories', {
        method: 'POST',
        body: { repositoryId }
      })
    }
    await refreshFavorites()
  } catch (error: any) {
    toast.add({
      title: 'Failed to update favorites',
      description: error.data?.message || 'An error occurred',
      color: 'error'
    })
  } finally {
    updatingFavorite.value.delete(repositoryId)
  }
}

interface SyncResult {
  success: boolean
  repository: string
  synced: {
    labels: number
    milestones: number
    issues: number
    pullRequests: number
  }
}

const accordionItems = computed(() => {
  if (!installations.value) return []

  return installations.value.map(installation => ({
    label: installation.account.login,
    value: String(installation.id),
    installation
  }))
})

async function syncRepository(fullName: string) {
  const [owner, name] = fullName.split('/')

  syncing.value.add(fullName)

  try {
    const result = await $fetch<SyncResult>(`/api/repositories/${owner}/${name}/sync`, {
      method: 'POST'
    })

    // Refresh installations to update sync status
    await refresh()

    toast.add({
      title: 'Repository synced',
      description: `Synced ${result.synced.issues} issues, ${result.synced.pullRequests} PRs, ${result.synced.labels} labels, ${result.synced.milestones} milestones`,
      color: 'success'
    })
  } catch (error: any) {
    toast.add({
      title: 'Sync failed',
      description: error.data?.message || 'An error occurred',
      color: 'error'
    })
  } finally {
    syncing.value.delete(fullName)
  }
}

async function importAllRepositories(installation: Installation) {
  const unsyncedRepos = installation.repositories.filter(r => !r.synced)
  if (!unsyncedRepos.length) {
    toast.add({
      title: 'All repositories imported',
      description: 'All repositories are already imported.',
      color: 'neutral'
    })
    return
  }

  unsyncedRepos.forEach(repo => syncing.value.add(repo.fullName))

  try {
    await Promise.all(unsyncedRepos.map(async (repo) => {
      const [owner, name] = repo.fullName.split('/')
      try {
        await $fetch(`/api/repositories/${owner}/${name}/sync`, { method: 'POST' })
        // Optimistically update local state
        repo.synced = true
        repo.lastSyncedAt = new Date()
        triggerRef(installations)
      } finally {
        syncing.value.delete(repo.fullName)
      }
    }))

    toast.add({
      title: 'Repositories imported',
      description: `Successfully imported ${unsyncedRepos.length} repositories.`,
      color: 'success'
    })
  } catch (error: any) {
    await refresh()
    toast.add({
      title: 'Import failed',
      description: error.data?.message || 'Some repositories failed to import.',
      color: 'error'
    })
  }
}

async function syncAllRepositories(installation: Installation) {
  const syncedRepos = installation.repositories.filter(r => r.synced)
  if (!syncedRepos.length) {
    return
  }

  syncedRepos.forEach(repo => syncing.value.add(repo.fullName))

  try {
    await Promise.all(syncedRepos.map(async (repo) => {
      const [owner, name] = repo.fullName.split('/')
      try {
        await $fetch(`/api/repositories/${owner}/${name}/sync`, { method: 'POST' })
        // Optimistically update local state
        repo.lastSyncedAt = new Date()
        triggerRef(installations)
      } finally {
        syncing.value.delete(repo.fullName)
      }
    }))

    toast.add({
      title: 'Repositories synced',
      description: `Successfully synced ${syncedRepos.length} repositories.`,
      color: 'success'
    })
  } catch (error: any) {
    await refresh()
    toast.add({
      title: 'Sync failed',
      description: error.data?.message || 'Some repositories failed to sync.',
      color: 'error'
    })
  }
}

async function removeAllRepositories(installation: Installation) {
  const syncedRepos = installation.repositories.filter(r => r.synced)
  if (!syncedRepos.length) {
    return
  }

  syncedRepos.forEach(repo => deleting.value.add(repo.fullName))

  try {
    await Promise.all(syncedRepos.map(async (repo) => {
      const [owner, name] = repo.fullName.split('/')
      try {
        await $fetch(`/api/repositories/${owner}/${name}`, { method: 'DELETE' })
        // Optimistically update local state
        repo.synced = false
        repo.lastSyncedAt = null
        triggerRef(installations)
      } finally {
        deleting.value.delete(repo.fullName)
      }
    }))

    toast.add({
      title: 'Repositories removed',
      description: `Successfully removed ${syncedRepos.length} repositories.`,
      color: 'success'
    })
  } catch (error: any) {
    await refresh()
    toast.add({
      title: 'Remove failed',
      description: error.data?.message || 'Some repositories failed to remove.',
      color: 'error'
    })
  }
}

function getInstallationDropdownItems(installation: Installation) {
  const hasUnsynced = installation.repositories.some(r => !r.synced)
  const hasSynced = installation.repositories.some(r => r.synced)

  const items: DropdownMenuItem[][] = [
    [{
      label: 'Configure',
      icon: 'i-lucide-external-link',
      to: getGitHubConfigUrl(installation),
      target: '_blank'
    }]
  ]

  if (hasUnsynced) {
    items.push([{
      label: 'Import all',
      icon: 'i-lucide-download',
      onSelect: () => importAllRepositories(installation)
    }])
  }

  if (hasSynced) {
    items.push([{
      label: 'Sync all',
      icon: 'i-lucide-refresh-cw',
      onSelect: () => syncAllRepositories(installation)
    }])

    items.push([{
      label: 'Remove all',
      icon: 'i-lucide-trash-2',
      color: 'error' as const,
      onSelect: () => removeAllRepositories(installation)
    }])
  }

  return items
}

async function deleteRepository(fullName: string) {
  const [owner, name] = fullName.split('/')

  deleting.value.add(fullName)

  try {
    await $fetch(`/api/repositories/${owner}/${name}`, {
      method: 'DELETE'
    })

    // Refresh installations to update sync status
    await refresh()

    toast.add({
      title: 'Repository removed',
      description: `${fullName} and all its data have been removed`,
      color: 'success'
    })
  } catch (error: any) {
    toast.add({
      title: 'Delete failed',
      description: error.data?.message || 'An error occurred',
      color: 'error'
    })
  } finally {
    deleting.value.delete(fullName)
  }
}

function getGitHubConfigUrl(installation: Installation) {
  if (installation.account.type === 'Organization') {
    return `https://github.com/organizations/${installation.account.login}/settings/installations/${installation.id}`
  }
  return `https://github.com/settings/installations/${installation.id}`
}

function getInstallUrl() {
  return `https://github.com/apps/${config.github.appSlug}/installations/new`
}

// ============================================================================
// Notification Subscription Logic
// ============================================================================

// Preset configurations
const presets = {
  participating: { issues: false, pullRequests: false, releases: true, ci: false, mentions: true, activity: true },
  all: { issues: true, pullRequests: true, releases: true, ci: true, mentions: true, activity: true },
  ignore: { issues: false, pullRequests: false, releases: false, ci: false, mentions: false, activity: false }
}

// Update subscription preference
async function updateSubscription(repo: InstallationRepository, updates: Partial<RepositorySubscription>) {
  const [owner, name] = repo.fullName.split('/')

  updatingSubscription.value = repo.fullName

  try {
    const result = await $fetch<RepositorySubscription>(`/api/repositories/${owner}/${name}/subscription`, {
      method: 'PATCH',
      body: updates
    })

    // Optimistically update local state
    if (repo.subscription) {
      Object.assign(repo.subscription, result)
    }
    triggerRef(installations)
  } catch (error: any) {
    toast.add({
      title: 'Failed to update subscription',
      description: error.data?.message || 'An error occurred',
      color: 'error'
    })
  } finally {
    updatingSubscription.value = null
  }
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

// Build dropdown items for notification settings
function getNotificationDropdownItems(repo: InstallationRepository): DropdownMenuItem[][] {
  if (!repo.subscription) return []

  const sub = repo.subscription
  const activePreset = getActivePreset(sub)

  return [[
    {
      label: 'Participating and @mentions',
      description: 'Releases, @mentions, and activity on subscribed issues.',
      icon: 'i-lucide-users',
      active: activePreset === 'participating',
      onSelect: () => updateSubscription(repo, presets.participating)
    },
    {
      label: 'All activity',
      description: 'All activity in the repository.',
      icon: 'i-lucide-activity',
      active: activePreset === 'all',
      onSelect: () => updateSubscription(repo, presets.all)
    },
    {
      label: 'Ignore',
      description: 'Receive no notifications.',
      icon: 'i-lucide-eye-off',
      active: activePreset === 'ignore',
      onSelect: () => updateSubscription(repo, presets.ignore)
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
          icon: 'i-octicon-issue-opened-16',
          checked: sub.issues,
          onUpdateChecked: (checked: boolean) => updateSubscription(repo, { issues: checked })
        },
        {
          type: 'checkbox',
          label: 'Pull requests',
          icon: 'i-octicon-git-pull-request-16',
          checked: sub.pullRequests,
          onUpdateChecked: (checked: boolean) => updateSubscription(repo, { pullRequests: checked })
        },
        {
          type: 'checkbox',
          label: 'Releases',
          icon: 'i-octicon-tag-16',
          checked: sub.releases,
          onUpdateChecked: (checked: boolean) => updateSubscription(repo, { releases: checked })
        },
        {
          type: 'checkbox',
          label: 'CI failures',
          icon: 'i-octicon-x-circle-16',
          checked: sub.ci,
          onUpdateChecked: (checked: boolean) => updateSubscription(repo, { ci: checked })
        },
        {
          type: 'checkbox',
          label: 'Mentions',
          icon: 'i-octicon-mention-16',
          checked: sub.mentions,
          onUpdateChecked: (checked: boolean) => updateSubscription(repo, { mentions: checked })
        },
        {
          type: 'checkbox',
          label: 'Activities',
          icon: 'i-octicon-bell-16',
          checked: sub.activity,
          onUpdateChecked: (checked: boolean) => updateSubscription(repo, { activity: checked })
        }
      ]]
    }
  ]]
}

// Get label and icon for the notification dropdown button
function getSubscriptionSummary(repo: InstallationRepository): { label: string, icon: string } {
  if (!repo.subscription) {
    return { label: 'Default', icon: 'i-lucide-bell' }
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
</script>

<template>
  <div class="flex flex-col flex-1 min-h-0">
    <UPageCard
      title="Connected repositories"
      description="Install the GitHub App on your account or organization to get started."
      variant="naked"
      orientation="horizontal"
      class="mb-4"
      :ui="{ title: 'leading-7', container: 'flex! flex-row! gap-0! items-start!' }"
    >
      <UButton
        icon="i-lucide-plus"
        color="neutral"
        variant="soft"
        size="sm"
        :to="getInstallUrl()"
        target="_blank"
        class="me-4"
      />
    </UPageCard>

    <UCard
      class="max-h-full overflow-y-auto"
      :ui="{
        body: 'p-0 sm:p-0'
      }"
    >
      <UAccordion
        v-if="installations?.length"
        :items="accordionItems"
        :ui="{
          item: 'group',
          header: 'sticky top-0 bg-elevated/25 hover:bg-elevated/50 backdrop-blur-xl z-1 transition-colors',
          trigger: 'px-4 py-3 gap-3',
          body: 'pb-0 divide-y divide-default border-t border-default'
        }"
      >
        <template #leading="{ item }">
          <UAvatar :src="item.installation.account.avatar" :alt="item.label" class="rounded-md" />
        </template>

        <template #default="{ item }">
          <div class="flex-1 text-left">
            <p class="text-sm font-medium">
              {{ item.label }}
            </p>
            <p class="text-sm text-muted font-normal">
              <template v-if="item.installation.repositories?.length">
                <span v-if="item.installation.repositories.every((r: any) => r.synced)" class="text-success">
                  All {{ item.installation.repositories.length }} repos synced
                </span>
                <span v-else-if="item.installation.repositories.some((r: any) => r.synced)">
                  {{ item.installation.repositories.filter((r: any) => r.synced).length }} of {{ item.installation.repositories.length }} repos synced
                </span>
                <span v-else>
                  {{ item.installation.repositories.length }} repos
                </span>
              </template>
              <template v-else>
                No repositories
              </template>
            </p>
          </div>
        </template>

        <template #trailing="{ item }">
          <div class="flex items-center gap-2 ms-auto">
            <UDropdownMenu
              :content="{ align: 'start' }"
              :items="getInstallationDropdownItems(item.installation)"
              size="sm"
            >
              <UButton
                icon="i-lucide-ellipsis-vertical"
                color="neutral"
                variant="soft"
                size="sm"
                @click.stop
              />
            </UDropdownMenu>

            <UButton
              icon="i-lucide-chevron-down"
              color="neutral"
              variant="soft"
              size="sm"
              :ui="{
                leadingIcon: 'group-data-[state=open]:rotate-180 transition-transform duration-200'
              }"
            />
          </div>
        </template>

        <template #body="{ item }">
          <div v-for="repo in item.installation.repositories" :key="repo.id" class="flex items-center justify-between py-3 px-4 bg-default gap-3">
            <div class="flex items-center gap-3 min-w-0">
              <UAvatar :icon="repo.private ? 'i-lucide-lock' : 'i-lucide-book'" />
              <div class="min-w-0">
                <p class="font-medium truncate flex items-center gap-2">
                  <NuxtLink :to="`https://github.com/${repo.fullName}`" target="_blank">{{ repo.name }}</NuxtLink>
                  <UBadge
                    v-if="repo.synced"
                    color="success"
                    variant="subtle"
                    size="sm"
                  >
                    Synced
                  </UBadge>
                </p>
                <p class="text-sm text-muted truncate">
                  <template v-if="repo.synced && repo.lastSyncedAt">
                    Last synced {{ useTimeAgo(repo.lastSyncedAt).value }}
                  </template>
                  <template v-else>
                    Not imported yet
                  </template>
                </p>
              </div>
            </div>

            <div v-if="repo.synced" class="flex items-center gap-2 shrink-0">
              <!-- Favorite toggle -->
              <UTooltip :text="favoriteRepoIds.has(repo.id) ? 'Remove from favorites' : 'Add to favorites'">
                <UButton
                  :icon="favoriteRepoIds.has(repo.id) ? 'i-lucide-star' : 'i-lucide-star'"
                  color="neutral"
                  variant="soft"
                  size="sm"
                  :loading="updatingFavorite.has(repo.id)"
                  :class="favoriteRepoIds.has(repo.id) ? 'text-yellow-500' : 'text-muted'"
                  @click="toggleFavorite(repo.id)"
                />
              </UTooltip>

              <!-- Notification dropdown -->
              <UDropdownMenu
                v-if="repo.subscription"
                :items="getNotificationDropdownItems(repo)"
                :content="{ align: 'end' }"
                :ui="{ content: 'w-72', itemDescription: 'text-clip' }"
                size="sm"
              >
                <UButton
                  color="neutral"
                  variant="soft"
                  size="sm"
                  v-bind="getSubscriptionSummary(repo)"
                  trailing-icon="i-lucide-chevron-down"
                  :loading="updatingSubscription === repo.fullName"
                  square
                  :ui="{
                    trailingIcon: 'group-data-[state=open]/button:rotate-180 transition-transform duration-200'
                  }"
                  class="group/button data-[state=open]:bg-accented/75"
                />
              </UDropdownMenu>

              <!-- Sync/Delete dropdown -->
              <UDropdownMenu
                :content="{ align: 'start' }"
                size="sm"
                :items="[
                  [{
                    label: 'Sync now',
                    icon: 'i-lucide-refresh-cw',
                    onSelect: () => syncRepository(repo.fullName)
                  }],
                  [{
                    label: 'Remove...',
                    icon: 'i-lucide-trash-2',
                    color: 'error' as const,
                    onSelect: () => deleteRepository(repo.fullName)
                  }]
                ]"
              >
                <UButton
                  color="neutral"
                  variant="soft"
                  size="sm"
                  icon="i-lucide-ellipsis-vertical"
                  :loading="syncing.has(repo.fullName) || deleting.has(repo.fullName)"
                  class="data-[state=open]:bg-accented/75"
                />
              </UDropdownMenu>
            </div>

            <UButton
              v-else
              icon="i-lucide-download"
              color="neutral"
              variant="soft"
              size="sm"
              :loading="syncing.has(repo.fullName)"
              @click="syncRepository(repo.fullName)"
            >
              Import
            </UButton>
          </div>

          <div v-if="!item.installation.repositories?.length" class="text-center py-8 text-muted">
            No repositories in this installation
          </div>
        </template>
      </UAccordion>

      <UAlert
        v-else
        title="No installations found"
        description="Install the GitHub App on your account or organization to get started."
        color="neutral"
        variant="soft"
      />
    </UCard>
  </div>
</template>
