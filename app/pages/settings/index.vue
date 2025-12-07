<script setup lang="ts">
import type { Installation } from '#shared/types/installation'

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

const syncing = ref<string | null>(null)
const deleting = ref<string | null>(null)

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

  syncing.value = fullName

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
    syncing.value = null
  }
}

async function deleteRepository(fullName: string) {
  const [owner, name] = fullName.split('/')

  deleting.value = fullName

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
    deleting.value = null
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
</script>

<template>
  <div class="flex flex-col flex-1 min-h-0">
    <UPageCard
      title="Connected organizations"
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
            <UButton
              icon="i-lucide-external-link"
              color="neutral"
              variant="soft"
              size="sm"
              :to="getGitHubConfigUrl(item.installation)"
              target="_blank"
              @click.stop
            />

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
          <div v-for="repo in item.installation.repositories" :key="repo.id" class="flex items-center justify-between py-3 px-4 bg-default">
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

            <UDropdownMenu
              v-if="repo.synced"
              :content="{ align: 'start' }"
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
                trailing-icon="i-lucide-ellipsis-vertical"
                :loading="syncing === repo.fullName || deleting === repo.fullName"
                class="data-[state=open]:bg-accented/75"
              />
            </UDropdownMenu>

            <UButton
              v-else
              icon="i-lucide-download"
              color="neutral"
              variant="soft"
              size="sm"
              :loading="syncing === repo.fullName"
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
