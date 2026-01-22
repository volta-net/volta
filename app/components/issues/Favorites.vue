<script setup lang="ts">
import type { FavoriteIssue } from '~/composables/useFavoriteIssues'

const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  favorites: FavoriteIssue[]
}>()

const emit = defineEmits<{
  select: [issue: FavoriteIssue['issue']]
  change: []
}>()

const toast = useToast()
const updating = ref<Set<number>>(new Set())

function issueToItem(fav: FavoriteIssue) {
  return {
    id: fav.issue.id,
    prefix: `${fav.issue.repository.fullName}#${fav.issue.number}`,
    label: `${fav.issue.title}`,
    icon: getIssueStateIcon(fav.issue),
    issue: fav.issue
  }
}

const groups = computed(() => [{
  id: 'favorites',
  items: props.favorites.map(issueToItem)
}])

function onSelect(item: any) {
  if (item?.issue) {
    emit('select', item.issue)
    open.value = false
  }
}

async function removeFavorite(issueId: number) {
  updating.value.add(issueId)

  try {
    await $fetch(`/api/favorites/issues/${issueId}`, { method: 'DELETE' })
    toast.add({ title: 'Removed from favorites', icon: 'i-lucide-star' })
    emit('change')
  } catch (error: any) {
    toast.add({
      title: 'Failed to remove favorite',
      description: error.data?.message || 'An error occurred',
      color: 'error'
    })
  } finally {
    updating.value.delete(issueId)
  }
}
</script>

<template>
  <USlideover
    v-model:open="open"
    title="Favorite issues"
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
        :groups="groups"
        placeholder="Search..."
        class="flex-1"
        :loading="updating.size > 0"
        :input="{
          ui: {
            base: 'ps-9.5',
            leading: 'ps-4'
          }
        }"
        :ui="{
          group: 'p-1.5',
          item: 'pl-2.5 pr-3'
        }"
        :fuse="{
          resultLimit: 1000
        }"
        @update:model-value="onSelect"
      >
        <template #empty>
          <UEmpty
            icon="i-lucide-star"
            description="No favorite issues yet"
            class="flex-1 -mt-[45px]"
          />
        </template>

        <template #item-trailing="{ item }">
          <UButton
            icon="i-lucide-x"
            variant="link"
            size="xs"
            class="opacity-0 group-hover:opacity-100 transition-opacity -my-1"
            :loading="updating.has(item.id)"
            @click.stop="removeFavorite(item.id)"
          />
        </template>
      </UCommandPalette>
    </template>
  </USlideover>
</template>
