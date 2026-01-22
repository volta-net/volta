<script setup lang="ts">
const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  repositories: Pick<Repository, 'id' | 'fullName' | 'private'>[]
  favorites: FavoriteRepository[]
}>()

const emit = defineEmits<{
  change: []
}>()

const toast = useToast()

// Local state for optimistic updates
const localFavoriteIds = ref<Set<number>>(new Set())
const hasChanges = ref(false)

// Sync local state when slideover opens or favorites prop changes while closed
watch(() => props.favorites, (favorites) => {
  if (!open.value) {
    localFavoriteIds.value = new Set(favorites?.map(f => f.repositoryId) || [])
  }
}, { immediate: true })

watch(open, (isOpen) => {
  if (isOpen) {
    // Reset local state from props when opening
    localFavoriteIds.value = new Set(props.favorites?.map(f => f.repositoryId) || [])
  } else if (hasChanges.value) {
    // Emit change when closing if there were changes
    emit('change')
    hasChanges.value = false
  }
})

function repoToItem(repo: Pick<Repository, 'id' | 'fullName' | 'private'>) {
  return {
    id: repo.id,
    label: repo.fullName,
    icon: repo.private ? 'i-lucide-lock' : 'i-lucide-book'
  }
}

const selected = computed({
  get: () => props.repositories.filter(repo => localFavoriteIds.value.has(repo.id)).map(repoToItem),
  set: async (items) => {
    const newSelectedIds = new Set(items.map(item => item.id))

    // Find added and removed
    const toAdd = items.filter(item => !localFavoriteIds.value.has(item.id))
    const toRemove = [...localFavoriteIds.value].filter(id => !newSelectedIds.has(id))

    // Optimistically update local state
    for (const item of toAdd) {
      localFavoriteIds.value.add(item.id)
    }
    for (const id of toRemove) {
      localFavoriteIds.value.delete(id)
    }

    // Persist changes
    await Promise.all([
      ...toAdd.map(item => setFavorite(item.id, true)),
      ...toRemove.map(id => setFavorite(id, false))
    ])
  }
})

const groups = computed(() => [{
  id: 'repositories',
  items: props.repositories.map(repoToItem)
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
    hasChanges.value = true
  } catch (error: any) {
    // Revert optimistic update on error
    if (value) {
      localFavoriteIds.value.delete(repositoryId)
    } else {
      localFavoriteIds.value.add(repositoryId)
    }
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
    <template #body>
      <UCommandPalette
        v-model="selected"
        :groups="groups"
        placeholder="Search..."
        multiple
        class="flex-1"
        selected-icon="i-lucide-star"
        :loading="updating.size > 0"
        :input="{
          ui: {
            base: 'ps-9.5',
            leading: 'ps-4'
          }
        }"
        :ui="{
          group: 'p-1.5',
          item: 'pl-2.5 pr-4',
          itemTrailingIcon: 'text-warning'
        }"
        :fuse="{
          resultLimit: 1000
        }"
      >
        <template #empty>
          <UEmpty
            icon="i-lucide-package"
            description="You have to install the GitHub App on your account or organization to get started."
            class="flex-1 -mt-[45px]"
            :actions="[{
              label: 'Import repositories',
              to: '/settings',
              icon: 'i-lucide-download',
              variant: 'soft'
            }]"
          />
        </template>
      </UCommandPalette>
    </template>
  </USlideover>
</template>
