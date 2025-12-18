<script setup lang="ts">
const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  favorites: { id: number, repositoryId: number, repository: any, createdAt: string }[]
}>()

const emit = defineEmits<{
  change: []
}>()

const toast = useToast()

// Fetch synced repositories user has access to (fast - from DB)
const { data: repositories } = await useFetch('/api/repositories/synced')

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

function goToSettings() {
  open.value = false
}
</script>

<template>
  <USlideover
    v-model:open="open"
    title="Favorite Repositories"
    inset
    :modal="false"
    :ui="{
      content: 'rounded-l-none sm:shadow-none',
      header: 'min-h-0 h-12 flex items-center justify-between',
      close: 'static',
      body: 'flex flex-col'
    }"
  >
    <template #body>
      <UEmpty
        v-if="!repositories?.length"
        icon="i-lucide-package"
        title="No synced repositories"
        description="You have to install the GitHub App on your account or organization to get started."
        variant="naked"
        size="lg"
        class="flex-1"
        :actions="[{
          label: 'Import repositories',
          to: '/settings',
          icon: 'i-lucide-download',
          color: 'neutral',
          variant: 'soft',
          size: 'sm',
          onClick: goToSettings
        }]"
      />

      <div v-else class="flex flex-col">
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
