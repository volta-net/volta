<script setup lang="ts">
const open = defineModel<boolean>('open', { default: false })

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
</script>

<template>
  <USlideover
    v-model:open="open"
    title="Favorite Repositories"
    inset
    :ui="{ header: 'min-h-0 h-12 flex items-center justify-between', close: 'static' }"
  >
    <template #body>
      <div v-if="allRepositories.length === 0" class="flex flex-col items-center justify-center text-center">
        <div class="size-12 rounded-full bg-elevated flex items-center justify-center mb-4">
          <UIcon name="i-lucide-inbox" class="size-6 text-muted" />
        </div>
        <p class="text-sm text-muted mb-4">
          No synced repositories
        </p>
        <UButton
          to="/settings"
          color="neutral"
          variant="soft"
          icon="i-lucide-settings"
          label="Import repositories"
          @click="open = false"
        />
      </div>

      <div v-else class="flex flex-col">
        <button
          v-for="repo in allRepositories"
          :key="repo.id"
          type="button"
          class="flex items-center gap-3 p-3 rounded-lg hover:bg-elevated/50 transition-colors text-left"
          :disabled="updating.has(repo.id)"
          @click="toggleFavorite(repo.id)"
        >
          <UIcon
            :name="repo.private ? 'i-lucide-lock' : 'i-lucide-book'"
            class="size-4 text-muted shrink-0"
          />

          <span class="flex-1 text-sm truncate">{{ repo.fullName }}</span>

          <UIcon
            v-if="updating.has(repo.id)"
            name="i-lucide-loader-2"
            class="size-4 animate-spin text-muted"
          />
          <UIcon
            v-else-if="favoriteRepoIds.has(repo.id)"
            name="i-lucide-star"
            class="size-4 text-yellow-500"
          />
          <div v-else class="size-4" />
        </button>
      </div>
    </template>
  </USlideover>
</template>
