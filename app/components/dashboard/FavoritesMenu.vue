<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

const emit = defineEmits<{
  change: []
}>()

const toast = useToast()

// Fetch user's installations and their repositories
const { data: installations } = await useFetch('/api/installations')

// Fetch current favorites
const { data: favorites, refresh: refreshFavorites } = await useFetch('/api/favorites/repositories')

const favoriteRepoIds = computed(() => new Set(favorites.value?.map(f => f.repositoryId) || []))

const allRepositories = computed(() => {
  if (!installations.value) return []

  return installations.value.flatMap(installation =>
    installation.repositories
      .filter(repo => repo.synced)
      .map(repo => ({
        ...repo,
        installationLogin: installation.account.login
      }))
  )
})

const updating = ref<Set<number>>(new Set())

async function toggleFavorite(repositoryId: number) {
  updating.value.add(repositoryId)

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
    emit('change')
  } catch (error: any) {
    toast.add({
      title: 'Failed to update favorites',
      description: error.data?.message || 'An error occurred',
      color: 'error'
    })
  } finally {
    updating.value.delete(repositoryId)
  }
}

const dropdownItems = computed<DropdownMenuItem[][]>(() => {
  if (allRepositories.value.length === 0) {
    return [[{
      label: 'No synced repositories',
      disabled: true
    }, {
      label: 'Import repositories',
      icon: 'i-lucide-settings',
      to: '/settings'
    }]]
  }

  return [allRepositories.value.map(repo => ({
    type: 'checkbox',
    label: repo.fullName,
    icon: repo.private ? 'i-lucide-lock' : 'i-lucide-book',
    checked: favoriteRepoIds.value.has(repo.id),
    loading: updating.value.has(repo.id),
    onSelect: (e: Event) => {
      e.preventDefault()
      toggleFavorite(repo.id)
    }
  }))]
})
</script>

<template>
  <UDropdownMenu
    :items="dropdownItems"
    :content="{ side: 'bottom', align: 'start' }"
    :ui="{ content: 'w-72 max-h-80 overflow-y-auto', itemTrailingIcon: 'text-yellow-500 dark:text-yellow-400' }"
    checked-icon="i-lucide-star"
    size="sm"
  >
    <UButton
      color="neutral"
      variant="soft"
      icon="i-lucide-star"
      trailing-icon="i-lucide-chevron-down"
      :label="favorites?.length ? `${favorites.length} favorite${favorites.length > 1 ? 's' : ''}` : 'Select favorites'"
      size="sm"
      :ui="{
        trailingIcon: 'group-data-[state=open]:rotate-180 transition-transform duration-200'
      }"
      class="group data-[state=open]:bg-accented/75"
    />
  </UDropdownMenu>
</template>
