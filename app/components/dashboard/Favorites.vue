<script setup lang="ts">
import type { FavoriteRepository, RepositoryListItem } from '#shared/types/favorites'

const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  favorites: FavoriteRepository[]
  repositories: RepositoryListItem[]
}>()

const emit = defineEmits<{
  change: []
}>()

const toast = useToast()

const favoriteRepoIds = computed(() => new Set(props.favorites?.map(f => f.repositoryId) || []))

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
    title="Favorite repositories"
    inset
    :modal="false"
    :ui="{
      content: 'lg:rounded-l-none sm:shadow-none',
      header: 'min-h-0 h-12 flex items-center justify-between',
      close: 'static',
      body: 'flex flex-col'
    }"
  >
    <template v-if="repositories?.length" #body>
      <button
        v-for="repo in repositories"
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

        <span class="flex-1 text-sm font-medium truncate">{{ repo.fullName }}</span>

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
    </template>
  </USlideover>
</template>
