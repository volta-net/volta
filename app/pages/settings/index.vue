<script setup lang="ts">
import { triggerRef } from 'vue'
import type { DropdownMenuItem } from '@nuxt/ui'

const toast = useToast()
const config = useRuntimeConfig().public

const {
  installations,
  installationsStatus,
  refresh,
  isSyncing,
  isBeingPolled,
  syncRepository,
  syncMultiple
} = useRepositorySync()

const {
  getDropdownItems: getSubscriptionDropdownItems,
  getSummary: getSubscriptionSummary
} = useRepositorySubscription(installations)

// Local loading states
const deleting = ref<Set<string>>(new Set())

// Installation-level bulk operation states
const importingAll = ref<Set<number>>(new Set())
const syncingAll = ref<Set<number>>(new Set())
const removingAll = ref<Set<number>>(new Set())

// Check if user can sync (requires write access or higher)
function canSync(repo: InstallationRepository) {
  return repo.permission === 'admin' || repo.permission === 'maintain' || repo.permission === 'write'
}

// Sort repositories: synced first, then by stars (desc), then by updatedAt (desc)
function sortRepositories(repos: InstallationRepository[]) {
  return [...repos].sort((a, b) => {
    if (a.synced && !b.synced) return -1
    if (!a.synced && b.synced) return 1

    const starsA = a.stars ?? 0
    const starsB = b.stars ?? 0
    if (starsA !== starsB) return starsB - starsA

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

// ============================================================================
// Bulk Operations
// ============================================================================

async function importAllRepositories(installation: Installation) {
  // Only import repos where user has write access
  const unsyncedRepos = installation.repositories.filter(r => !r.synced && canSync(r))
  if (!unsyncedRepos.length) {
    const hasReadOnlyRepos = installation.repositories.some(r => !r.synced && !canSync(r))
    toast.add({
      title: hasReadOnlyRepos ? 'No importable repositories' : 'All repositories imported',
      description: hasReadOnlyRepos
        ? 'You need write access to import repositories.'
        : 'All repositories are already imported.'
    })
    return
  }

  const repoNames = unsyncedRepos.map(r => r.fullName)

  if (repoNames.some(name => isBeingPolled(name))) {
    toast.add({
      title: 'Import in progress',
      description: 'Some repositories are already being imported.'
    })
    return
  }

  importingAll.value.add(installation.id)

  try {
    // Start all workflows (server sets syncing=true synchronously)
    await Promise.all(unsyncedRepos.map(async (repo) => {
      const [owner, name] = repo.fullName.split('/')
      await $fetch(`/api/repositories/${owner}/${name}/sync`, { method: 'POST' })
    }))

    // Poll until all are done (syncMultiple handles refresh internally)
    const allCompleted = await syncMultiple(repoNames)

    if (allCompleted) {
      toast.add({
        title: 'Repositories imported',
        description: `Successfully imported ${unsyncedRepos.length} repositories.`,
        color: 'success'
      })
    } else {
      toast.add({
        title: 'Import in progress',
        description: 'Some repositories are still importing in the background.',
        color: 'warning'
      })
    }
  } catch (error: any) {
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
  // Only sync repos where user has write access
  const syncedRepos = installation.repositories.filter(r => r.synced && canSync(r))
  if (!syncedRepos.length) return

  const repoNames = syncedRepos.map(r => r.fullName)

  if (repoNames.some(name => isBeingPolled(name))) {
    toast.add({
      title: 'Sync in progress',
      description: 'Some repositories are already being synced.'
    })
    return
  }

  syncingAll.value.add(installation.id)

  try {
    // Start all workflows (server sets syncing=true synchronously)
    await Promise.all(syncedRepos.map(async (repo) => {
      const [owner, name] = repo.fullName.split('/')
      await $fetch(`/api/repositories/${owner}/${name}/sync`, { method: 'POST' })
    }))

    // Poll until all are done (syncMultiple handles refresh internally)
    const allCompleted = await syncMultiple(repoNames)

    if (allCompleted) {
      toast.add({
        title: 'Repositories synced',
        description: `Successfully synced ${syncedRepos.length} repositories.`,
        color: 'success'
      })
    } else {
      toast.add({
        title: 'Sync in progress',
        description: 'Some repositories are still syncing in the background.',
        color: 'warning'
      })
    }
  } catch (error: any) {
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
  if (!syncedRepos.length) return

  removingAll.value.add(installation.id)
  syncedRepos.forEach(repo => deleting.value.add(repo.fullName))

  try {
    await Promise.all(syncedRepos.map(async (repo) => {
      const [owner, name] = repo.fullName.split('/')
      try {
        await $fetch(`/api/repositories/${owner}/${name}`, { method: 'DELETE' })
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

// ============================================================================
// Single Repository Operations
// ============================================================================

async function deleteRepository(fullName: string) {
  const [owner, name] = fullName.split('/')

  deleting.value.add(fullName)

  try {
    await $fetch(`/api/repositories/${owner}/${name}`, { method: 'DELETE' })
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

// ============================================================================
// Dropdown Menus
// ============================================================================

function getInstallationDropdownItems(installation: Installation) {
  // Only count repos where user can sync (has write access)
  const hasUnsyncedWithAccess = installation.repositories.some(r => !r.synced && canSync(r))
  const hasSyncedWithAccess = installation.repositories.some(r => r.synced && canSync(r))

  const isImporting = importingAll.value.has(installation.id)
  const isSyncingAll = syncingAll.value.has(installation.id)
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

  if (hasUnsyncedWithAccess) {
    actionItems.push({
      label: 'Import all',
      icon: 'i-lucide-download',
      loading: isImporting,
      disabled: isImporting || isSyncingAll || isRemoving,
      onSelect: (e) => {
        e.preventDefault()
        importAllRepositories(installation)
      }
    })
  }

  if (hasSyncedWithAccess) {
    actionItems.push({
      label: 'Sync all',
      icon: 'i-lucide-refresh-cw',
      loading: isSyncingAll,
      disabled: isImporting || isSyncingAll || isRemoving,
      onSelect: (e) => {
        e.preventDefault()
        syncAllRepositories(installation)
      }
    })
  }

  // Remove all is available for any synced repos (doesn't require write access)
  const hasSynced = installation.repositories.some(r => r.synced)
  if (hasSynced) {
    actionItems.push({
      label: 'Remove all',
      icon: 'i-lucide-trash-2',
      loading: isRemoving,
      color: 'error' as const,
      disabled: isImporting || isSyncingAll || isRemoving,
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

// ============================================================================
// URL Helpers
// ============================================================================

function getGitHubConfigUrl(installation: Installation) {
  if (installation.account.type === 'Organization') {
    return `https://github.com/organizations/${installation.account.login}/settings/installations/${installation.id}`
  }
  return `https://github.com/settings/installations/${installation.id}`
}

function getInstallUrl() {
  return `https://github.com/apps/${config.github.appSlug}/installations/new`
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
            loading="lazy"
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
              <UAvatar :icon="repo.private ? 'i-lucide-lock' : 'i-lucide-book'" size="md" loading="lazy" />
              <div class="min-w-0">
                <p class="font-medium truncate flex items-center gap-1.5">
                  <NuxtLink :to="`https://github.com/${repo.fullName}`" target="_blank">{{ repo.name }}</NuxtLink>
                  <UBadge
                    v-if="isSyncing(repo.fullName)"
                    color="important"
                    variant="subtle"
                    icon="i-lucide-loader-circle"
                    label="Syncing"
                    size="xs"
                    :ui="{ leadingIcon: 'animate-spin' }"
                  />
                  <UBadge
                    v-else-if="repo.synced && repo.lastSyncedAt"
                    color="success"
                    variant="subtle"
                    size="xs"
                  >
                    Synced {{ useTimeAgo(repo.lastSyncedAt).value }}
                  </UBadge>
                  <UBadge
                    v-if="!canSync(repo)"
                    color="neutral"
                    variant="subtle"
                    size="xs"
                  >
                    {{ repo.permission }}
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
                </p>
              </div>
            </div>

            <div v-if="repo.synced" class="flex items-center gap-2 shrink-0">
              <!-- Notification dropdown (available for all synced repos, regardless of permission level) -->
              <UDropdownMenu
                :items="getSubscriptionDropdownItems(repo)"
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
                  isSyncing(repo.fullName) ? {
                    label: 'Force sync',
                    icon: 'i-lucide-refresh-cw',
                    loading: false,
                    disabled: deleting.has(repo.fullName) || !canSync(repo),
                    onSelect: () => {
                      syncRepository(repo.fullName, true)
                    }
                  } : {
                    label: canSync(repo) ? 'Sync now' : `Sync (requires write access)`,
                    icon: 'i-lucide-refresh-cw',
                    loading: false,
                    disabled: deleting.has(repo.fullName) || !canSync(repo),
                    onSelect: () => {
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

            <UTooltip
              v-else
              :text="`You need write access to import this repository (current: ${repo.permission})`"
              :disabled="canSync(repo)"
            >
              <UButton
                icon="i-lucide-download"
                variant="soft"
                :loading="isSyncing(repo.fullName)"
                :disabled="!canSync(repo)"
                @click="syncRepository(repo.fullName)"
              >
                Import
              </UButton>
            </UTooltip>
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
