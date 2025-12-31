<script setup lang="ts">
import type { IssueDetail, Label } from '#shared/types/issue'

const props = defineProps<{
  issue: IssueDetail
}>()

const emit = defineEmits<{
  (e: 'refresh'): void
}>()

const toast = useToast()
const { icon: stateIcon, color: stateColor, label: stateLabel } = useIssueState(computed(() => props.issue))

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
  avatarUrl: string | null
}

const selectedAssignees = computed<UserItem[]>(() => {
  return (props.issue.assignees ?? []).map(u => ({
    id: u.id,
    label: u.login,
    login: u.login,
    avatarUrl: u.avatarUrl
  }))
})
const availableAssignees = ref<UserItem[]>([])

const selectedReviewers = computed<UserItem[]>(() => {
  return (props.issue.requestedReviewers ?? []).map(u => ({
    id: u.id,
    label: u.login,
    login: u.login,
    avatarUrl: u.avatarUrl
  }))
})
const availableReviewers = ref<UserItem[]>([])
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="space-y-3">
      <!-- State -->
      <div class="flex items-center gap-1.5">
        <UIcon :name="stateIcon" :class="['size-4', stateColor]" />
        <span class="text-sm">{{ stateLabel }} {{ issue.pullRequest ? 'pull request' : 'issue' }} #{{ issue.number }}</span>
      </div>

      <!-- Repository -->
      <div class="flex items-center gap-1.5">
        <UAvatar
          :src="`https://github.com/${issue.repository.fullName.split('/')[0]}.png`"
          :alt="issue.repository.fullName"
          size="3xs"
        />
        <span class="text-sm">{{ issue.repository.fullName }}</span>
      </div>

      <!-- Author -->
      <div v-if="issue.user" class="flex items-center gap-1.5">
        <UAvatar
          :src="issue.user.avatarUrl!"
          :alt="issue.user.login"
          size="3xs"
        />
        <span class="text-sm">{{ issue.user.login }}</span>
      </div>

      <!-- View changes link (PRs only) -->
      <UButton
        v-if="issue.pullRequest && issue.htmlUrl"
        icon="i-simple-icons-github"
        label="View changes"
        color="neutral"
        variant="ghost"
        size="sm"
        :to="`${issue.htmlUrl}/files`"
        target="_blank"
        trailing-icon="i-lucide-arrow-up-right"
        square
        class="-ml-1.5"
        :ui="{ trailingIcon: 'size-3 self-start text-dimmed' }"
      />
    </div>

    <USeparator />

    <!-- Metadata -->
    <div class="space-y-4">
      <!-- Labels -->
      <div class="flex items-start gap-4">
        <span class="text-sm text-muted w-20 shrink-0 pt-1">Labels</span>
        <div class="flex-1">
          <USelectMenu
            :model-value="selectedLabels"
            :items="availableLabels"
            multiple
            :search-input="{ placeholder: 'Search labels...' }"
            :open="isLabelsOpen"
            @update:open="handleLabelsOpen"
            @update:model-value="onUpdateLabels"
          >
            <template #default="{ modelValue }">
              <div class="flex flex-wrap items-center gap-1.5">
                <UButton
                  icon="i-lucide-plus"
                  label="Add"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                />
                <UBadge
                  v-for="label in (modelValue as LabelItem[])"
                  :key="label.id"
                  variant="subtle"
                  :style="{ '--badge-bg': `#${label.color}20`, '--badge-color': `#${label.color}` }"
                  :ui="{ base: 'bg-(--badge-bg) text-(--badge-color) gap-1' }"
                >
                  <span class="size-2 rounded-full" :style="{ backgroundColor: `#${label.color}` }" />
                  {{ label.name }}
                </UBadge>
              </div>
            </template>
            <template #item-leading="{ item }">
              <span class="size-3 rounded-full shrink-0" :style="{ backgroundColor: `#${(item as LabelItem).color}` }" />
            </template>
            <template #item-label="{ item }">
              {{ (item as LabelItem).name }}
            </template>
          </USelectMenu>
        </div>
      </div>

      <!-- Assignees -->
      <div class="flex items-start gap-4">
        <span class="text-sm text-muted w-20 shrink-0 pt-1">Assignees</span>
        <div class="flex-1">
          <USelectMenu
            :model-value="selectedAssignees"
            :items="availableAssignees"
            multiple
            disabled
            :search-input="{ placeholder: 'Search users...' }"
          >
            <template #default="{ modelValue }">
              <div class="flex flex-wrap items-center gap-1.5">
                <UButton
                  icon="i-lucide-plus"
                  label="Add"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  disabled
                />
                <UBadge
                  v-for="assignee in (modelValue as UserItem[])"
                  :key="assignee.id"
                  color="neutral"
                  variant="subtle"
                  :ui="{ base: 'gap-1' }"
                >
                  <UAvatar :src="assignee.avatarUrl!" :alt="assignee.login" size="3xs" />
                  {{ assignee.login }}
                </UBadge>
              </div>
            </template>
            <template #item-leading="{ item }">
              <UAvatar :src="(item as UserItem).avatarUrl!" :alt="(item as UserItem).login" size="3xs" />
            </template>
            <template #item-label="{ item }">
              {{ (item as UserItem).login }}
            </template>
          </USelectMenu>
        </div>
      </div>

      <!-- Reviewers (PRs only) -->
      <div v-if="issue.pullRequest" class="flex items-start gap-4">
        <span class="text-sm text-muted w-20 shrink-0 pt-1">Reviewers</span>
        <div class="flex-1">
          <USelectMenu
            :model-value="selectedReviewers"
            :items="availableReviewers"
            multiple
            disabled
            :search-input="{ placeholder: 'Search users...' }"
          >
            <template #default="{ modelValue }">
              <div class="flex flex-wrap items-center gap-1.5">
                <UButton
                  icon="i-lucide-plus"
                  label="Add"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  disabled
                />
                <UBadge
                  v-for="reviewer in (modelValue as UserItem[])"
                  :key="reviewer.id"
                  color="neutral"
                  variant="subtle"
                  :ui="{ base: 'gap-1' }"
                >
                  <UAvatar :src="reviewer.avatarUrl!" :alt="reviewer.login" size="3xs" />
                  {{ reviewer.login }}
                </UBadge>
              </div>
            </template>
            <template #item-leading="{ item }">
              <UAvatar :src="(item as UserItem).avatarUrl!" :alt="(item as UserItem).login" size="3xs" />
            </template>
            <template #item-label="{ item }">
              {{ (item as UserItem).login }}
            </template>
          </USelectMenu>
        </div>
      </div>
    </div>

    <!-- PR Stats -->
    <template v-if="issue.pullRequest">
      <USeparator />

      <div class="grid grid-cols-2 gap-3 text-sm">
        <div class="flex items-center gap-2">
          <UIcon name="i-octicon-git-commit-16" class="size-4 text-muted" />
          <span>{{ issue.commits }} commit{{ issue.commits !== 1 ? 's' : '' }}</span>
        </div>
        <div class="flex items-center gap-2">
          <UIcon name="i-octicon-file-diff-16" class="size-4 text-muted" />
          <span>{{ issue.changedFiles }} file{{ issue.changedFiles !== 1 ? 's' : '' }}</span>
        </div>
        <div class="flex items-center gap-2 text-success">
          <UIcon name="i-lucide-plus" class="size-4" />
          <span>{{ issue.additions }}</span>
        </div>
        <div class="flex items-center gap-2 text-error">
          <UIcon name="i-lucide-minus" class="size-4" />
          <span>{{ issue.deletions }}</span>
        </div>
      </div>
    </template>
  </div>
</template>
