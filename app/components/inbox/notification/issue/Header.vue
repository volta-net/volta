<script setup lang="ts">
import type { Issue } from '#shared/types/issue'

const props = defineProps<{
  issue: Issue
}>()

const emit = defineEmits<{
  (e: 'update:title', title: string): void
}>()

const { getStateIcon, getStateColor, getStateBadge } = useIssueState(computed(() => props.issue))
const toast = useToast()

const editedTitle = ref(props.issue.title)
const isEditing = ref(false)
const isSaving = ref(false)

// Favorite functionality
const { data: favoriteIssues, refresh: refreshFavorites } = await useFetch('/api/favorites/issues', {
  default: () => []
})

const isFavorited = computed(() => favoriteIssues.value?.some(f => f.issueId === props.issue.id) || false)
const updatingFavorite = ref(false)

async function toggleFavorite() {
  updatingFavorite.value = true

  try {
    if (isFavorited.value) {
      await $fetch(`/api/favorites/issues/${props.issue.id}`, { method: 'DELETE' })
      toast.add({ title: 'Removed from favorites', icon: 'i-lucide-star' })
    } else {
      await $fetch('/api/favorites/issues', {
        method: 'POST',
        body: { issueId: props.issue.id }
      })
      toast.add({ title: 'Added to favorites', icon: 'i-lucide-star' })
    }
    await refreshFavorites()
  } catch (error: any) {
    toast.add({
      title: 'Failed to update favorites',
      description: error.data?.message || 'An error occurred',
      color: 'error'
    })
  } finally {
    updatingFavorite.value = false
  }
}

watch(() => props.issue.title, (newTitle) => {
  editedTitle.value = newTitle
})

async function saveTitle() {
  if (editedTitle.value === props.issue.title) {
    isEditing.value = false
    return
  }

  isSaving.value = true
  try {
    const [owner, repo] = props.issue.repository!.fullName.split('/')
    await $fetch(`/api/issues/${props.issue.id}/title`, {
      method: 'PATCH',
      body: { title: editedTitle.value, owner, repo, issueNumber: props.issue.number }
    })
    emit('update:title', editedTitle.value)
    toast.add({ title: 'Title updated', icon: 'i-lucide-check' })
  } catch (err: any) {
    toast.add({ title: 'Failed to update title', description: err.message, color: 'error', icon: 'i-lucide-x' })
    editedTitle.value = props.issue.title
  } finally {
    isSaving.value = false
    isEditing.value = false
  }
}

function cancelEdit() {
  isEditing.value = false
  editedTitle.value = props.issue.title
}
</script>

<template>
  <div class="flex items-start gap-3">
    <UIcon :name="getStateIcon()" :class="[getStateColor(), 'size-5 mt-1 shrink-0']" />
    <div class="flex-1 min-w-0">
      <!-- Editable Title -->
      <div v-if="isEditing" class="flex items-center gap-2">
        <UInput
          v-model="editedTitle"
          class="flex-1"
          size="lg"
          autofocus
          @keydown.enter="saveTitle"
          @keydown.escape="cancelEdit"
        />
        <UButton
          icon="i-lucide-check"
          color="primary"
          :loading="isSaving"
          @click="saveTitle"
        />
        <UButton
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          @click="cancelEdit"
        />
      </div>
      <h1
        v-else
        class="text-lg font-semibold text-highlighted cursor-pointer hover:text-primary transition-colors"
        @click="isEditing = true"
      >
        {{ issue.title }}
      </h1>

      <!-- Meta info -->
      <div class="flex items-center gap-2 mt-1 text-sm text-muted">
        <UBadge v-bind="getStateBadge()" size="xs" />
        <span>#{{ issue.number }}</span>
        <span>·</span>
        <UAvatar
          v-if="issue.user?.avatarUrl"
          :src="issue.user.avatarUrl"
          :alt="issue.user.login"
          size="3xs"
        />
        <span>{{ issue.user?.login }}</span>
        <span>opened {{ useTimeAgo(new Date(issue.createdAt)) }}</span>
      </div>
    </div>

    <!-- Favorite button -->
    <UTooltip :text="isFavorited ? 'Remove from favorites' : 'Add to favorites'">
      <UButton
        :icon="isFavorited ? 'i-lucide-star' : 'i-lucide-star'"
        color="neutral"
        variant="ghost"
        :loading="updatingFavorite"
        :class="isFavorited ? 'text-yellow-500' : 'text-muted'"
        @click="toggleFavorite"
      />
    </UTooltip>
  </div>
</template>
