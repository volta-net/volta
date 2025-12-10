<script setup lang="ts">
import type { Issue } from '#shared/types/issue'

const props = defineProps<{
  issue: Issue
  isSubscribed: boolean
}>()

const emit = defineEmits<{
  (e: 'update:title', title: string): void
  (e: 'toggle-subscription'): void
}>()

const { getStateIcon, getStateColor, getStateBadge } = useIssueState(computed(() => props.issue))
const toast = useToast()

const editedTitle = ref(props.issue.title)
const isEditing = ref(false)
const isSaving = ref(false)

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
          size="sm"
          :loading="isSaving"
          @click="saveTitle"
        />
        <UButton
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          size="sm"
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

    <!-- Actions -->
    <div class="flex items-center gap-1">
      <UTooltip :text="isSubscribed ? 'Unsubscribe' : 'Subscribe'">
        <UButton
          :icon="isSubscribed ? 'i-lucide-bell-ring' : 'i-lucide-bell'"
          color="neutral"
          variant="ghost"
          size="sm"
          @click="emit('toggle-subscription')"
        />
      </UTooltip>
      <UButton
        icon="i-simple-icons-github"
        color="neutral"
        variant="ghost"
        size="sm"
        :to="issue.htmlUrl!"
        target="_blank"
      />
    </div>
  </div>
</template>
