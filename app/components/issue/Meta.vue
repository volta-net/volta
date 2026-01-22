<script setup lang="ts">
const props = defineProps<{
  issue: IssueDetail
  analyzingResolution?: boolean
}>()

const emit = defineEmits<{
  (e: 'refresh'): void
  (e: 'scroll-to-answer', commentId: number): void
}>()

const toast = useToast()
const { copy } = useClipboard()
const { icon: stateIcon, color: stateColor, label: stateLabel } = useIssueState(computed(() => props.issue))

function copyIssueNumber() {
  copy(String(props.issue.number))
  toast.add({ title: `Copied #${props.issue.number} to clipboard`, icon: 'i-lucide-copy' })
}

function copyIssueUrl() {
  if (!props.issue.htmlUrl) return
  copy(props.issue.htmlUrl)
  toast.add({ title: 'Copied URL to clipboard', icon: 'i-lucide-copy' })
}

function copyGitBranch() {
  if (!props.issue.headRef) return
  copy(props.issue.headRef)
  toast.add({ title: `Copied ${props.issue.headRef} to clipboard`, icon: 'i-lucide-copy' })
}

defineShortcuts({
  'meta_shift_,': copyIssueUrl,
  'meta_.': copyIssueNumber,
  'meta_shift_.': copyGitBranch
})

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

// Build list of all reviewers with their state (combines submitted reviews + pending requests)
const reviewersWithState = useReviewersWithState(computed(() => props.issue))
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

// AI Resolution Analysis (issues only)
const { getConfig: getResolutionConfig } = useResolutionStatus()
const resolutionConfig = computed(() => {
  // Only show for issues, not PRs
  if (props.issue.pullRequest) return null
  return getResolutionConfig(props.issue.resolutionStatus)
})

// CI Status (PRs only)
const ciStatusConfig = computed(() => getAggregatedCIStatus(props.issue.ciStatuses))

// Review state (PRs only)
const reviewState = useReviewState(computed(() => props.issue))
</script>

<template>
  <div class="flex flex-col gap-3 -mx-1.5">
    <!-- Properties -->
    <div class="flex flex-col gap-1">
      <span class="text-xs/6 text-muted font-medium px-1.5">Properties</span>

      <!-- State -->
      <UButton
        as="div"
        :icon="stateIcon"
        variant="ghost"
        :ui="{ leadingIcon: `text-${stateColor}` }"
        class="text-sm/4 hover:bg-transparent active:bg-transparent pl-2 pr-0"
      >
        {{ stateLabel }} {{ issue.pullRequest ? 'pull request' : 'issue' }}

        <template #trailing>
          <div class="flex items-center ms-auto -my-1.5">
            <UTooltip :text="`Copy URL`" :kbds="['meta', 'shift', ',']">
              <UButton
                icon="i-lucide-link"
                variant="ghost"
                @click="copyIssueUrl"
              />
            </UTooltip>

            <UTooltip :text="`Copy number`" :kbds="['meta', '.']">
              <UButton
                icon="i-lucide-hash"
                variant="ghost"
                @click="copyIssueNumber"
              />
            </UTooltip>

            <UTooltip v-if="issue.pullRequest" :text="`Copy branch`" :kbds="['meta', 'shift', '.']">
              <UButton
                icon="i-lucide-git-branch"
                variant="ghost"
                @click="copyGitBranch"
              />
            </UTooltip>
          </div>
        </template>
      </UButton>

      <UButton
        v-if="issue.user"
        :to="`https://github.com/${issue.user.login}`"
        target="_blank"
        variant="ghost"
        class="text-sm/4 px-2"
        :label="issue.user.login"
        :avatar="{
          src: issue.user.avatarUrl!,
          alt: issue.user.login
        }"
      />

      <!-- CI Status (PRs only) -->
      <UButton
        v-if="ciStatusConfig"
        :to="ciStatusConfig.htmlUrl!"
        :label="ciStatusConfig.label"
        :icon="ciStatusConfig.icon"
        :ui="{ leadingIcon: [`text-${ciStatusConfig.color}`, ciStatusConfig.animate && 'animate-pulse'] }"
        target="_blank"
        variant="ghost"
        class="text-sm/4 px-2"
      />

      <!-- Review state (PRs only) -->
      <UButton
        v-if="reviewState"
        as="div"
        :label="reviewState.label"
        :icon="reviewState.icon"
        :ui="{ leadingIcon: `text-${reviewState.color}` }"
        variant="ghost"
        class="text-sm/4 px-2 hover:bg-transparent active:bg-transparent"
      />

      <!-- Resolution status (issues only) -->
      <UButton
        v-if="!issue.pullRequest && resolutionConfig"
        as="div"
        :icon="resolutionConfig.icon"
        :ui="{ leadingIcon: `text-${resolutionConfig.color}` }"
        variant="ghost"
        class="text-sm/4 px-2 hover:bg-transparent active:bg-transparent"
      >
        {{ resolutionConfig.label }}
        <span v-if="issue.resolutionConfidence" class="text-muted italic">
          ({{ issue.resolutionConfidence }}% confidence)
        </span>
      </UButton>

      <!-- Analyzing state (issues only) -->
      <UButton
        v-else-if="!issue.pullRequest && analyzingResolution"
        as="div"
        icon="i-lucide-loader-circle"
        label="Analyzing..."
        :ui="{ leadingIcon: 'animate-spin' }"
        variant="ghost"
        class="text-sm/4 px-2 hover:bg-transparent active:bg-transparent"
      />

      <!-- Not yet analyzed (issues only) -->
      <UButton
        v-else-if="!issue.pullRequest"
        as="div"
        icon="i-lucide-sparkles"
        label="Not analyzed yet"
        :ui="{ leadingIcon: 'text-muted' }"
        variant="ghost"
        class="text-sm/4 px-2 hover:bg-transparent active:bg-transparent"
      />

      <!-- View changes link (PRs only) -->
      <UButton
        v-if="issue.pullRequest && issue.htmlUrl"
        :to="`${issue.htmlUrl}/files`"
        target="_blank"
        icon="i-lucide-file-diff"
        variant="ghost"
        class="text-sm/4 px-2"
      >
        <span class="text-success">+{{ issue.additions }}</span>
        <span class="text-error">-{{ issue.deletions }}</span>
      </UButton>
    </div>

    <!-- Labels -->
    <div class="flex flex-col gap-1">
      <span class="text-xs/6 text-muted font-medium px-1.5">Labels</span>

      <div class="flex-1 flex items-center gap-1 flex-wrap">
        <IssueLabel
          v-for="label in selectedLabels"
          :key="label.id"
          :label="label"
        />

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
          class="rounded-full data-[state=open]:bg-elevated hover:ring-accented"
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
      </div>
    </div>

    <!-- Assignees -->
    <div class="flex flex-col gap-1">
      <span class="text-xs/6 text-muted font-medium px-1.5">Assignees</span>

      <div class="flex-1 flex items-center gap-1 flex-wrap">
        <IssueUser
          v-for="assignee in selectedAssignees"
          :key="assignee.id"
          :user="assignee"
        />

        <USelectMenu
          :model-value="selectedAssignees"
          :items="availableAssignees"
          icon="i-lucide-plus"
          trailing-icon=""
          size="xs"
          :ui="{ content: 'min-w-fit' }"
          :content="{ align: 'start', sideOffset: 5 }"
          variant="ghost"
          class="rounded-full data-[state=open]:bg-elevated hover:ring-accented"
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
      </div>
    </div>

    <!-- Reviewers (PRs only) -->
    <div v-if="issue.pullRequest" class="flex flex-col gap-1">
      <span class="text-xs/6 text-muted font-medium px-1.5">Reviewers</span>

      <div class="flex-1 flex items-center gap-1 flex-wrap">
        <UBadge
          v-for="reviewer in reviewersWithState"
          :key="reviewer.id"
          :label="reviewer.login"
          :avatar="{
            src: `https://github.com/${reviewer.login}.png`,
            alt: reviewer.login
          }"
          class="rounded-full"
        >
          <template v-if="reviewer.color" #trailing>
            <UChip
              :color="reviewer.color"
              standalone
              inset
              size="md"
              class="p-1"
            />
          </template>
        </UBadge>

        <USelectMenu
          :model-value="selectedReviewers"
          :items="availableReviewers"
          icon="i-lucide-plus"
          trailing-icon=""
          size="xs"
          :ui="{ content: 'min-w-fit' }"
          :content="{ align: 'start', sideOffset: 5 }"
          variant="ghost"
          class="rounded-full data-[state=open]:bg-elevated hover:ring-accented"
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
      </div>
    </div>

    <!-- Linked PRs (issues only) -->
    <div v-if="!issue.pullRequest && issue.linkedPrs?.length" class="flex flex-col gap-1">
      <span class="text-xs/6 text-muted font-medium px-1.5">Linked PRs</span>

      <div class="flex flex-col gap-1">
        <UButton
          v-for="pr in issue.linkedPrs"
          :key="pr.id"
          :to="pr.htmlUrl!"
          target="_blank"
          icon="i-lucide-git-pull-request"
          :ui="{ leadingIcon: 'text-success' }"
          variant="ghost"
          class="text-sm/4 px-2"
        >
          <span class="text-muted font-normal">#{{ pr.number }}</span>
          <span class="truncate">{{ pr.title }}</span>
        </UButton>
      </div>
    </div>

    <!-- Linked Issues (PRs only) -->
    <div v-if="issue.pullRequest && issue.linkedIssues?.length" class="flex flex-col gap-1">
      <span class="text-xs/6 text-muted font-medium px-1.5">Linked issues</span>

      <div class="flex flex-col gap-1">
        <UButton
          v-for="linkedIssue in issue.linkedIssues"
          :key="linkedIssue.id"
          :to="linkedIssue.htmlUrl!"
          target="_blank"
          :icon="linkedIssue.state === 'open' ? 'i-lucide-circle-dot' : 'i-lucide-circle-check'"
          :ui="{ leadingIcon: linkedIssue.state === 'open' ? 'text-success' : 'text-important' }"
          variant="ghost"
          class="text-sm/4 px-2"
        >
          <span class="text-muted font-normal">#{{ linkedIssue.number }}</span>
          <span class="truncate">{{ linkedIssue.title }}</span>
        </UButton>
      </div>
    </div>
  </div>
</template>
