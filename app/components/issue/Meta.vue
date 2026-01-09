<script setup lang="ts">
const props = defineProps<{
  issue: IssueDetail
}>()

const emit = defineEmits<{
  (e: 'refresh'): void
}>()

const toast = useToast()
const { copy } = useClipboard()
const { icon: stateIcon, color: stateColor, label: stateLabel } = useIssueState(computed(() => props.issue))

function copyIssueNumber() {
  copy(String(props.issue.number))
  toast.add({ title: `Copied #${props.issue.number} to clipboard`, icon: 'i-lucide-copy' })
}

// Repository info
const repoPath = computed(() => {
  if (!props.issue.repository?.fullName) return { owner: '', name: '' }
  const [owner, name] = props.issue.repository.fullName.split('/')
  return { owner, name }
})

// Labels
interface LabelItem {
  id: number
  label: string
  name: string
  color: string
}

const isLabelsOpen = ref(false)
const availableLabels = ref<LabelItem[]>([])

const selectedLabels = computed<LabelItem[]>(() => {
  return (props.issue.labels ?? []).map(l => ({
    id: l.id,
    label: l.name,
    name: l.name,
    color: l.color
  }))
})

async function fetchLabels() {
  if (!repoPath.value.owner) return
  try {
    const labels = await $fetch<Label[]>(`/api/repositories/${repoPath.value.owner}/${repoPath.value.name}/labels`)
    availableLabels.value = (labels ?? []).map(l => ({
      id: l.id,
      label: l.name,
      name: l.name,
      color: l.color
    }))
  } catch {
    // Labels not available
  }
}

function handleLabelsOpen(open: boolean) {
  isLabelsOpen.value = open
  if (open) {
    fetchLabels()
  }
}

async function onUpdateLabels(newLabels: LabelItem[]) {
  const currentIds = new Set(props.issue.labels?.map(l => l.id) ?? [])
  const newIds = new Set(newLabels.map(l => l.id))

  // Find added and removed labels
  const added = newLabels.filter(l => !currentIds.has(l.id))
  const removed = (props.issue.labels ?? []).filter(l => !newIds.has(l.id))

  try {
    // Add new labels
    for (const label of added) {
      await $fetch(`/api/repositories/${repoPath.value.owner}/${repoPath.value.name}/issues/${props.issue.number}/labels`, {
        method: 'POST',
        body: { labelId: label.id }
      })
    }
    // Remove old labels
    for (const label of removed) {
      await $fetch(`/api/repositories/${repoPath.value.owner}/${repoPath.value.name}/issues/${props.issue.number}/labels/${label.id}`, {
        method: 'DELETE'
      })
    }
    emit('refresh')
  } catch (err: any) {
    toast.add({ title: 'Failed to update labels', description: err.message, color: 'error', icon: 'i-lucide-x' })
  }
}

// Users
interface UserItem {
  id: number
  label: string
  login: string
  name: string | null
  avatarUrl: string | null
}

const selectedAssignees = computed<UserItem[]>(() => {
  return (props.issue.assignees ?? []).map(u => ({
    id: u.id,
    label: u.login,
    login: u.login,
    name: u.name,
    avatarUrl: u.avatarUrl
  }))
})
const availableAssignees = ref<UserItem[]>([])
const isAssigneesOpen = ref(false)

async function fetchAssignees() {
  if (!repoPath.value.owner) return
  try {
    const collaborators = await $fetch<{ id: number, login: string, name: string | null, avatarUrl: string | null }[]>(`/api/repositories/${repoPath.value.owner}/${repoPath.value.name}/collaborators`)
    availableAssignees.value = (collaborators ?? []).map(u => ({
      id: u.id,
      label: u.login,
      login: u.login,
      name: u.name,
      avatarUrl: u.avatarUrl
    }))
  } catch {
    // Collaborators not available
  }
}

function handleAssigneesOpen(open: boolean) {
  isAssigneesOpen.value = open
  if (open) {
    fetchAssignees()
  }
}

async function onUpdateAssignees(newAssignees: UserItem[]) {
  const currentIds = new Set(props.issue.assignees?.map(u => u.id) ?? [])
  const newIds = new Set(newAssignees.map(u => u.id))

  // Find added and removed assignees
  const added = newAssignees.filter(u => !currentIds.has(u.id))
  const removed = (props.issue.assignees ?? []).filter(u => !newIds.has(u.id))

  try {
    // Add new assignees
    for (const user of added) {
      await $fetch(`/api/repositories/${repoPath.value.owner}/${repoPath.value.name}/issues/${props.issue.number}/assignees`, {
        method: 'POST',
        body: { userId: user.id, login: user.login }
      })
    }
    // Remove old assignees
    for (const user of removed) {
      await $fetch(`/api/repositories/${repoPath.value.owner}/${repoPath.value.name}/issues/${props.issue.number}/assignees/${user.id}`, {
        method: 'DELETE',
        body: { login: user.login }
      })
    }
    emit('refresh')
  } catch (err: any) {
    toast.add({ title: 'Failed to update assignees', description: err.message, color: 'error', icon: 'i-lucide-x' })
  }
}

const selectedReviewers = computed<UserItem[]>(() => {
  return (props.issue.requestedReviewers ?? []).map(u => ({
    id: u.id,
    label: u.login,
    login: u.login,
    name: u.name,
    avatarUrl: u.avatarUrl
  }))
})
const availableReviewers = ref<UserItem[]>([])
const isReviewersOpen = ref(false)

async function fetchReviewers() {
  if (!repoPath.value.owner) return
  try {
    const collaborators = await $fetch<{ id: number, login: string, name: string | null, avatarUrl: string | null }[]>(`/api/repositories/${repoPath.value.owner}/${repoPath.value.name}/collaborators`)
    availableReviewers.value = (collaborators ?? []).map(u => ({
      id: u.id,
      label: u.login,
      login: u.login,
      name: u.name,
      avatarUrl: u.avatarUrl
    }))
  } catch {
    // Collaborators not available
  }
}

function handleReviewersOpen(open: boolean) {
  isReviewersOpen.value = open
  if (open) {
    fetchReviewers()
  }
}

async function onUpdateReviewers(newReviewers: UserItem[]) {
  const currentIds = new Set(props.issue.requestedReviewers?.map(u => u.id) ?? [])
  const newIds = new Set(newReviewers.map(u => u.id))

  // Find added and removed reviewers
  const added = newReviewers.filter(u => !currentIds.has(u.id))
  const removed = (props.issue.requestedReviewers ?? []).filter(u => !newIds.has(u.id))

  try {
    // Add new reviewers
    for (const user of added) {
      await $fetch(`/api/repositories/${repoPath.value.owner}/${repoPath.value.name}/issues/${props.issue.number}/reviewers`, {
        method: 'POST',
        body: { userId: user.id, login: user.login }
      })
    }
    // Remove old reviewers
    for (const user of removed) {
      await $fetch(`/api/repositories/${repoPath.value.owner}/${repoPath.value.name}/issues/${props.issue.number}/reviewers/${user.id}`, {
        method: 'DELETE',
        body: { login: user.login }
      })
    }
    emit('refresh')
  } catch (err: any) {
    toast.add({ title: 'Failed to update reviewers', description: err.message, color: 'error', icon: 'i-lucide-x' })
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="space-y-3">
      <!-- State -->
      <div class="flex items-center gap-1.5">
        <UIcon :name="stateIcon" :class="['size-4', stateColor]" />
        <button class="text-sm font-medium" @click="copyIssueNumber">
          {{ stateLabel }} {{ issue.pullRequest ? 'pull request' : 'issue' }} <span class="text-highlighted">#{{ issue.number }}</span>
        </button>
      </div>

      <!-- Repository -->
      <NuxtLink :to="`https://github.com/${issue.repository.fullName.split('/')[0]}`" target="_blank" class="flex items-center gap-1.5">
        <UAvatar
          :src="`https://github.com/${issue.repository.fullName.split('/')[0]}.png`"
          :alt="issue.repository.fullName"
          size="3xs"
        />
        <span class="text-sm font-medium">{{ issue.repository.fullName }}</span>
      </NuxtLink>

      <!-- Author -->
      <NuxtLink
        v-if="issue.user"
        :to="`https://github.com/${issue.user.login}`"
        target="_blank"
        class="flex items-center gap-1.5"
      >
        <UAvatar
          :src="issue.user.avatarUrl!"
          :alt="issue.user.login"
          size="3xs"
        />
        <span class="text-sm font-medium">{{ issue.user.login }}</span>
      </NuxtLink>

      <!-- View changes link (PRs only) -->
      <NuxtLink
        v-if="issue.pullRequest && issue.htmlUrl"
        :to="`${issue.htmlUrl}/files`"
        target="_blank"
        class="inline-flex items-center gap-1.5 text-sm font-medium"
      >
        <UIcon name="i-simple-icons-github" class="size-4" />

        <span class="text-success">+{{ issue.additions }}</span>
        <span class="text-error">-{{ issue.deletions }}</span>
      </NuxtLink>
    </div>

    <USeparator />

    <!-- Metadata -->
    <div class="space-y-4">
      <!-- Labels -->
      <div class="flex items-start gap-4">
        <span class="text-sm/6 text-highlighted font-medium w-20 shrink-0">Labels</span>

        <div class="flex-1 flex items-center gap-1 flex-wrap">
          <USelectMenu
            :model-value="selectedLabels"
            :items="availableLabels"
            multiple
            icon="i-lucide-plus"
            trailing-icon=""
            size="xs"
            :search-input="{ placeholder: 'Search labels...' }"
            :open="isLabelsOpen"
            :ui="{ content: 'min-w-fit' }"
            :content="{ align: 'start', sideOffset: 5 }"
            variant="ghost"
            class="rounded-full pe-3 data-[state=open]:bg-elevated hover:ring-accented"
            @update:open="handleLabelsOpen"
            @update:model-value="onUpdateLabels"
          >
            <template #default>
              Add
            </template>

            <template #item-leading="{ item }">
              <span class="size-2 rounded-full shrink-0 self-center mx-1" :style="{ backgroundColor: `#${(item as LabelItem).color}` }" />
            </template>
          </USelectMenu>

          <IssueLabel
            v-for="label in selectedLabels"
            :key="label.id"
            :label="label"
          />
        </div>
      </div>

      <!-- Assignees -->
      <div class="flex items-start gap-4">
        <span class="text-sm/6 text-highlighted font-medium w-20 shrink-0">Assignees</span>

        <div class="flex-1 flex items-center gap-1 flex-wrap">
          <USelectMenu
            :model-value="selectedAssignees"
            :items="availableAssignees"
            icon="i-lucide-plus"
            trailing-icon=""
            size="xs"
            :ui="{ content: 'min-w-fit' }"
            :content="{ align: 'start', sideOffset: 5 }"
            variant="ghost"
            class="rounded-full pe-3 data-[state=open]:bg-elevated hover:ring-accented"
            multiple
            :search-input="{ placeholder: 'Search users...' }"
            :open="isAssigneesOpen"
            @update:model-value="onUpdateAssignees"
            @update:open="handleAssigneesOpen"
          >
            <template #default>
              Add
            </template>

            <template #item-leading="{ item }">
              <UAvatar :src="item.avatarUrl!" :alt="item.login" size="3xs" />
            </template>

            <template #item-label="{ item }">
              {{ item.login }}
            </template>
          </USelectMenu>

          <IssueUser
            v-for="assignee in selectedAssignees"
            :key="assignee.id"
            :user="assignee"
          />
        </div>
      </div>

      <!-- Reviewers (PRs only) -->
      <div v-if="issue.pullRequest" class="flex items-start gap-4">
        <span class="text-sm/6 text-highlighted font-medium w-20 shrink-0">Reviewers</span>

        <div class="flex-1 flex items-center gap-1 flex-wrap">
          <USelectMenu
            :model-value="selectedReviewers"
            :items="availableReviewers"
            icon="i-lucide-plus"
            trailing-icon=""
            size="xs"
            :ui="{ content: 'min-w-fit' }"
            :content="{ align: 'start', sideOffset: 5 }"
            variant="ghost"
            class="rounded-full pe-3 data-[state=open]:bg-elevated hover:ring-accented"
            multiple
            :search-input="{ placeholder: 'Search users...' }"
            :open="isReviewersOpen"
            @update:model-value="onUpdateReviewers"
            @update:open="handleReviewersOpen"
          >
            <template #default>
              Add
            </template>
            <template #item-leading="{ item }">
              <UAvatar :src="item.avatarUrl!" :alt="item.login" size="3xs" />
            </template>
            <template #item-label="{ item }">
              {{ item.login }}
            </template>
          </USelectMenu>

          <IssueUser
            v-for="reviewer in selectedReviewers"
            :key="reviewer.id"
            :user="reviewer"
          />
        </div>
      </div>
    </div>
  </div>
</template>
