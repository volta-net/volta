<script setup lang="ts">
import type { FavoriteRepository } from '#shared/types/favorites'

const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  repositories: Pick<DBRepository, 'id' | 'fullName' | 'private'>[]
  favorites: FavoriteRepository[]
}>()

const emit = defineEmits<{
  change: []
}>()

const toast = useToast()

const favoriteRepoIds = computed(() => new Set(props.favorites?.map(f => f.repositoryId) || []))

const selected = computed({
  get: () => props.repositories.filter(repo => favoriteRepoIds.value.has(repo.id)).map(repo => ({
    id: repo.id,
    label: repo.fullName,
    icon: repo.private ? 'i-lucide-lock' : 'i-lucide-book'
  })),
  set: async (items) => {
    const newSelectedIds = new Set(items.map(item => item.id))

    // Find added (in new selection but not in current favorites)
    const toAdd = items.filter(item => !favoriteRepoIds.value.has(item.id))
    // Find removed (in current favorites but not in new selection)
    const toRemove = [...favoriteRepoIds.value].filter(id => !newSelectedIds.has(id))

    await Promise.all([
      ...toAdd.map(item => setFavorite(item.id, true)),
      ...toRemove.map(id => setFavorite(id, false))
    ])
  }
})

const groups = computed(() => [{
  id: 'repositories',
  items: props.repositories.map(repo => ({
    id: repo.id,
    label: repo.fullName,
    icon: repo.private ? 'i-lucide-lock' : 'i-lucide-book'
  }))
}])

const updating = ref<Set<number>>(new Set())

async function setFavorite(repositoryId: number, value: boolean) {
  updating.value.add(repositoryId)

  try {
    if (value) {
      await $fetch('/api/favorites/repositories', {
        method: 'POST',
        body: { repositoryId }
      })
    } else {
      await $fetch(`/api/favorites/repositories/${repositoryId}`, { method: 'DELETE' })
    }
    emit('change')
  } catch (error: any) {
    toast.add({
      title: 'Failed to update favorite',
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
      body: 'flex flex-col p-0!'
    }"
  >
    <template v-if="repositories?.length" #body>
      <UCommandPalette
        v-model="selected"
        :groups="groups"
        placeholder="Search repositories..."
        multiple
        class="flex-1"
        selected-icon="i-lucide-star"
        :loading="updating.size > 0"
        :input="{
          ui: {
            base: 'ps-9.5 text-sm',
            leading: 'ps-4'
          }
        }"
        :ui="{
          group: 'p-1.5',
          item: 'items-center pl-2.5 pr-4',
          itemLeadingIcon: 'size-4',
          itemTrailingIcon: 'size-4 text-warning'
        }"
        :fuse="{
          resultLimit: 1000
        }"
      />
    </template>
  </USlideover>
</template>
