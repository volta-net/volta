<script setup lang="ts">
import { triggerRef } from 'vue'
import type { DropdownMenuItem } from '@nuxt/ui'

const toast = useToast()
const config = useRuntimeConfig().public

const { data: installations, status: installationsStatus, refresh } = useLazyFetch<Installation[]>('/api/installations')

// Refresh data when window gains focus
const focused = useWindowFocus()
watch(focused, (isFocused) => {
  if (isFocused) {
    refresh()
  }
})

// Track locally initiated syncs (for immediate UI feedback before server confirms)
const localSyncing = ref<Set<string>>(new Set())
const deleting = ref<Set<string>>(new Set())
const updatingSubscription = ref<string | null>(null)

// Combined syncing state: server-side OR locally initiated
function isSyncing(fullName: string) {
  if (localSyncing.value.has(fullName)) return true
  const repo = installations.value
    ?.flatMap(inst => inst.repositories)
    .find(r => r.fullName === fullName)
  return repo?.syncing ?? false
}

// Auto-poll when there are server-side syncing repos (for page refresh case)
const serverSyncingRepos = computed(() =>
  installations.value
    ?.flatMap(inst => inst.repositories)
    .filter(r => r.syncing)
    .map(r => r.fullName) ?? []
)

// Poll for server-side syncing repos on page load
watch(serverSyncingRepos, async (repos) => {
  for (const fullName of repos) {
    if (!localSyncing.value.has(fullName)) {
      // Server says it's syncing but we didn't initiate - start polling
      localSyncing.value.add(fullName)
      pollUntilComplete(fullName)
    }
  }
}, { immediate: true })

async function pollUntilComplete(fullName: string) {
  const [, name] = fullName.split('/')
  const maxAttempts = 180
  const pollInterval = 1000

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(resolve => setTimeout(resolve, pollInterval))
    await refresh()

    const repo = installations.value
      ?.flatMap(inst => inst.repositories)
      .find(r => r.fullName === fullName)

    if (repo && !repo.syncing) {
      localSyncing.value.delete(fullName)
      toast.add({
        title: `Repo ${name} imported`,
        description: 'Repository sync completed successfully',
        color: 'success'
      })
      return
    }
  }

  localSyncing.value.delete(fullName)
}

// Installation-level bulk operation loading states
const importingAll = ref<Set<number>>(new Set())
const syncingAll = ref<Set<number>>(new Set())
const removingAll = ref<Set<number>>(new Set())

interface SyncStartResult {
  started: boolean
  alreadySyncing?: boolean
  repository: string
  previousSyncedAt: string | null
}

// Sort repositories: synced first, then by stars (desc), then by updatedAt (desc)
function sortRepositories(repos: InstallationRepository[]) {
  return [...repos].sort((a, b) => {
    // First: synced repos come first
    if (a.synced && !b.synced) return -1
    if (!a.synced && b.synced) return 1

    // Second: sort by stars (descending)
    const starsA = a.stars ?? 0
    const starsB = b.stars ?? 0
    if (starsA !== starsB) return starsB - starsA

    // Third: sort by updatedAt (descending)
    const updatedA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
    const updatedB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
    return updatedB - updatedA
  })
}

const accordionItems = computed(() => {
  if (!installations.value) return []

  return installations.value.map(installation => ({
    label: installation.account.login,
    value: String(installation.id),
    installation: {
      ...installation,
      repositories: sortRepositories(installation.repositories)
    }
  }))
})

async function syncRepository(fullName: string) {
  const [owner, name] = fullName.split('/')

  localSyncing.value.add(fullName)

  try {
    // Start the workflow (returns immediately, server sets syncing=true)
    await $fetch<SyncStartResult>(`/api/repositories/${owner}/${name}/sync`, {
      method: 'POST'
    })

    // Poll until server-side syncing flag is false (workflow completed)
    const maxAttempts = 180 // 3 minutes max
    const pollInterval = 1000 // 1 second

    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(resolve => setTimeout(resolve, pollInterval))
      await refresh()

      // Find the repo in the refreshed data
      const repo = installations.value
        ?.flatMap(inst => inst.repositories)
        .find(r => r.fullName === fullName)

      if (repo && !repo.syncing) {
        // Sync completed!
        localSyncing.value.delete(fullName)
        toast.add({
          title: `Repo ${name} imported`,
          description: 'Repository sync completed successfully',
          color: 'success'
        })
        return
      }
    }

    // Timeout - workflow might still be running
    localSyncing.value.delete(fullName)
    toast.add({
      title: 'Sync in progress',
      description: 'The sync is taking longer than expected. It will complete in the background.',
      color: 'warning'
    })
  } catch (error: any) {
    localSyncing.value.delete(fullName)
    toast.add({
      title: 'Sync failed',
      description: error.data?.message || 'An error occurred',
      color: 'error'
    })
  }
}

async function importAllRepositories(installation: Installation) {
  const unsyncedRepos = installation.repositories.filter(r => !r.synced)
  if (!unsyncedRepos.length) {
    toast.add({
      title: 'All repositories imported',
      description: 'All repositories are already imported.'
    })
    return
  }

  importingAll.value.add(installation.id)
  unsyncedRepos.forEach(repo => localSyncing.value.add(repo.fullName))

  try {
    // Start all workflows
    await Promise.all(unsyncedRepos.map(async (repo) => {
      const [owner, name] = repo.fullName.split('/')
      await $fetch(`/api/repositories/${owner}/${name}/sync`, { method: 'POST' })
    }))

    // Poll until all are done
    const maxAttempts = 180
    const pollInterval = 2000

    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(resolve => setTimeout(resolve, pollInterval))
      await refresh()

      const stillSyncing = unsyncedRepos.filter((repo) => {
        const current = installations.value
          ?.flatMap(inst => inst.repositories)
          .find(r => r.fullName === repo.fullName)
        return current?.syncing
      })

      if (stillSyncing.length === 0) {
        unsyncedRepos.forEach(repo => localSyncing.value.delete(repo.fullName))
        toast.add({
          title: 'Repositories imported',
          description: `Successfully imported ${unsyncedRepos.length} repositories.`,
          color: 'success'
        })
        return
      }
    }

    // Timeout
    unsyncedRepos.forEach(repo => localSyncing.value.delete(repo.fullName))
    toast.add({
      title: 'Import in progress',
      description: 'Some repositories are still importing in the background.',
      color: 'warning'
    })
  } catch (error: any) {
    unsyncedRepos.forEach(repo => localSyncing.value.delete(repo.fullName))
    await refresh()
    toast.add({
      title: 'Import failed',
      description: error.data?.message || 'Some repositories failed to import.',
      color: 'error'
    })
  } finally {
    importingAll.value.delete(installation.id)
  }
}

async function syncAllRepositories(installation: Installation) {
  const syncedRepos = installation.repositories.filter(r => r.synced)
  if (!syncedRepos.length) {
    return
  }

  syncingAll.value.add(installation.id)
  syncedRepos.forEach(repo => localSyncing.value.add(repo.fullName))

  try {
    // Start all workflows
    await Promise.all(syncedRepos.map(async (repo) => {
      const [owner, name] = repo.fullName.split('/')
      await $fetch(`/api/repositories/${owner}/${name}/sync`, { method: 'POST' })
    }))

    // Poll until all are done
    const maxAttempts = 180
    const pollInterval = 2000

    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(resolve => setTimeout(resolve, pollInterval))
      await refresh()

      const stillSyncing = syncedRepos.filter((repo) => {
        const current = installations.value
          ?.flatMap(inst => inst.repositories)
          .find(r => r.fullName === repo.fullName)
        return current?.syncing
      })

      if (stillSyncing.length === 0) {
        syncedRepos.forEach(repo => localSyncing.value.delete(repo.fullName))
        toast.add({
          title: 'Repositories synced',
          description: `Successfully synced ${syncedRepos.length} repositories.`,
          color: 'success'
        })
        return
      }
    }

    // Timeout
    syncedRepos.forEach(repo => localSyncing.value.delete(repo.fullName))
    toast.add({
      title: 'Sync in progress',
      description: 'Some repositories are still syncing in the background.',
      color: 'warning'
    })
  } catch (error: any) {
    syncedRepos.forEach(repo => localSyncing.value.delete(repo.fullName))
    await refresh()
    toast.add({
      title: 'Sync failed',
      description: error.data?.message || 'Some repositories failed to sync.',
      color: 'error'
    })
  } finally {
    syncingAll.value.delete(installation.id)
  }
}

async function removeAllRepositories(installation: Installation) {
  const syncedRepos = installation.repositories.filter(r => r.synced)
  if (!syncedRepos.length) {
    return
  }

  removingAll.value.add(installation.id)
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
  } finally {
    removingAll.value.delete(installation.id)
  }
}

function getInstallationDropdownItems(installation: Installation) {
  const hasUnsynced = installation.repositories.some(r => !r.synced)
  const hasSynced = installation.repositories.some(r => r.synced)

  const isImporting = importingAll.value.has(installation.id)
  const isSyncing = syncingAll.value.has(installation.id)
  const isRemoving = removingAll.value.has(installation.id)

  const items: DropdownMenuItem[][] = [
    [{
      label: 'Configure',
      icon: 'i-lucide-external-link',
      to: getGitHubConfigUrl(installation),
      target: '_blank'
    }]
  ]

  const actionItems: DropdownMenuItem[] = []

  if (hasUnsynced) {
    actionItems.push({
      label: 'Import all',
      icon: 'i-lucide-download',
      loading: isImporting,
      disabled: isImporting || isSyncing || isRemoving,
      onSelect: (e) => {
        e.preventDefault()
        importAllRepositories(installation)
      }
    })
  }

  if (hasSynced) {
    actionItems.push({
      label: 'Sync all',
      icon: 'i-lucide-refresh-cw',
      loading: isSyncing,
      disabled: isImporting || isSyncing || isRemoving,
      onSelect: (e) => {
        e.preventDefault()
        syncAllRepositories(installation)
      }
    }, {
      label: 'Remove all',
      icon: 'i-lucide-trash-2',
      loading: isRemoving,
      color: 'error' as const,
      disabled: isImporting || isSyncing || isRemoving,
      onSelect: (e) => {
        e.preventDefault()
        removeAllRepositories(installation)
      }
    })
  }

  if (actionItems.length > 0) {
    items.push(actionItems)
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
      onSelect: (e) => {
        e.preventDefault()
        updateSubscription(repo, presets.participating)
      }
    },
    {
      label: 'All activity',
      description: 'All activity in the repository.',
      icon: 'i-lucide-activity',
      active: activePreset === 'all',
      onSelect: (e) => {
        e.preventDefault()
        updateSubscription(repo, presets.all)
      }
    },
    {
      label: 'Ignore',
      description: 'Receive no notifications.',
      icon: 'i-lucide-eye-off',
      active: activePreset === 'ignore',
      onSelect: (e) => {
        e.preventDefault()
        updateSubscription(repo, presets.ignore)
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
          onSelect: e => e.preventDefault()
        },
        {
          type: 'checkbox',
          label: 'Pull requests',
          icon: 'i-lucide-git-pull-request',
          checked: sub.pullRequests,
          onUpdateChecked: (checked: boolean) => updateSubscription(repo, { pullRequests: checked }),
          onSelect: e => e.preventDefault()
        },
        {
          type: 'checkbox',
          label: 'Releases',
          icon: 'i-lucide-tag',
          checked: sub.releases,
          onUpdateChecked: (checked: boolean) => updateSubscription(repo, { releases: checked }),
          onSelect: e => e.preventDefault()
        },
        {
          type: 'checkbox',
          label: 'CI failures',
          icon: 'i-lucide-circle-x',
          checked: sub.ci,
          onUpdateChecked: (checked: boolean) => updateSubscription(repo, { ci: checked }),
          onSelect: e => e.preventDefault()
        },
        {
          type: 'checkbox',
          label: 'Mentions',
          icon: 'i-lucide-at-sign',
          checked: sub.mentions,
          onUpdateChecked: (checked: boolean) => updateSubscription(repo, { mentions: checked }),
          onSelect: e => e.preventDefault()
        },
        {
          type: 'checkbox',
          label: 'Activities',
          icon: 'i-lucide-bell',
          checked: sub.activity,
          onUpdateChecked: (checked: boolean) => updateSubscription(repo, { activity: checked }),
          onSelect: e => e.preventDefault()
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
        variant="soft"
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
      <!-- Loading skeleton (only on initial load, not refresh) -->
      <div v-if="installationsStatus === 'pending' && !installations?.length" class="divide-y divide-default">
        <div v-for="i in 2" :key="i" class="px-4 py-3 flex items-center gap-3 bg-elevated/25">
          <USkeleton class="size-8 rounded-md" />
          <div class="flex-1 space-y-1.5 my-1">
            <USkeleton class="h-3 w-20" />
            <USkeleton class="h-2.5 w-24" />
          </div>
        </div>
      </div>

      <UAccordion
        v-else-if="installations?.length"
        :items="accordionItems"
        :ui="{
          item: 'group',
          header: 'sticky top-0 bg-elevated/25 hover:bg-elevated/50 backdrop-blur-xl z-1 transition-colors',
          trigger: 'px-4 py-3 gap-3',
          body: 'pb-0 divide-y divide-default border-t border-default'
        }"
      >
        <template #leading="{ item }">
          <UAvatar
            :src="item.installation.account.avatar"
            :alt="item.label"
            class="rounded-md"
            size="md"
          />
        </template>

        <template #default="{ item }">
          <div class="flex-1 text-left">
            <p class="text-sm font-medium">
              {{ item.label }}
            </p>
            <p class="text-xs text-muted font-normal">
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
            >
              <UButton
                icon="i-lucide-ellipsis-vertical"
                variant="soft"
                @click.stop
              />
            </UDropdownMenu>

            <UButton
              icon="i-lucide-chevron-down"
              variant="soft"
              :ui="{
                leadingIcon: 'group-data-[state=open]:rotate-180 transition-transform duration-200'
              }"
            />
          </div>
        </template>

        <template #body="{ item }">
          <div v-for="repo in item.installation.repositories" :key="repo.id" class="flex items-center justify-between py-3 px-4 bg-default gap-3">
            <div class="flex items-center gap-3 min-w-0">
              <UAvatar :icon="repo.private ? 'i-lucide-lock' : 'i-lucide-book'" size="md" />
              <div class="min-w-0">
                <p class="font-medium truncate flex items-center gap-2">
                  <NuxtLink :to="`https://github.com/${repo.fullName}`" target="_blank">{{ repo.name }}</NuxtLink>
                  <UBadge
                    v-if="repo.synced"
                    color="success"
                    variant="subtle"
                    size="xs"
                  >
                    Synced
                  </UBadge>
                </p>
                <p class="text-xs text-muted truncate flex items-center gap-1">
                  <span class="inline-flex items-center gap-1">
                    <UIcon name="i-lucide-star" class="size-3" />
                    {{ repo.stars?.toLocaleString() ?? 0 }}
                  </span>
                  <span class="text-muted">·</span>
                  <span class="inline-flex items-center gap-1">
                    <UIcon name="i-lucide-clock" class="size-3" />
                    {{ useTimeAgo(repo.updatedAt).value }}
                  </span>
                  <span class="text-muted">·</span>

                  <template v-if="repo.synced && repo.lastSyncedAt">
                    Synced {{ useTimeAgo(repo.lastSyncedAt).value }}
                  </template>
                  <template v-else>
                    Not imported yet
                  </template>
                </p>
              </div>
            </div>

            <div v-if="repo.synced" class="flex items-center gap-2 shrink-0">
              <!-- Notification dropdown -->
              <UDropdownMenu
                v-if="repo.subscription"
                :items="getNotificationDropdownItems(repo)"
                :content="{ align: 'end' }"
                :ui="{ content: 'w-72', itemDescription: 'text-clip' }"
              >
                <UButton
                  variant="soft"
                  v-bind="getSubscriptionSummary(repo)"
                  trailing-icon="i-lucide-chevron-down"
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
                :items="[
                  {
                    label: 'Sync now',
                    icon: 'i-lucide-refresh-cw',
                    loading: isSyncing(repo.fullName),
                    disabled: isSyncing(repo.fullName) || deleting.has(repo.fullName),
                    onSelect: (e) => {
                      e.preventDefault()
                      syncRepository(repo.fullName)
                    }
                  },
                  {
                    label: 'Remove...',
                    icon: 'i-lucide-trash-2',
                    color: 'error' as const,
                    loading: deleting.has(repo.fullName),
                    disabled: isSyncing(repo.fullName) || deleting.has(repo.fullName),
                    onSelect: (e) => {
                      e.preventDefault()
                      deleteRepository(repo.fullName)
                    }
                  }
                ]"
              >
                <UButton
                  variant="soft"
                  icon="i-lucide-ellipsis-vertical"
                  class="data-[state=open]:bg-accented/75"
                />
              </UDropdownMenu>
            </div>

            <UButton
              v-else
              icon="i-lucide-download"
              variant="soft"
              :loading="isSyncing(repo.fullName)"
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
        variant="soft"
      />
    </UCard>
  </div>
</template>
