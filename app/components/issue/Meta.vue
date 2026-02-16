<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

const props = defineProps<{
  issue: IssueDetail
  readonly?: boolean
  analyzingResolution?: boolean
}>()

const emit = defineEmits<{
  (e: 'refresh' | 'reopen-issue' | 'close-as-duplicate'): void
  (e: 'close-issue', stateReason: 'completed' | 'not_planned'): void
  (e: 'scroll-to-answer', commentId: number): void
}>()

const toast = useToast()
const { copy } = useClipboard()
const { selectIssue } = useFavoriteIssues()
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

const labelToType: Record<string, string> = {
  'bug': 'fix',
  'fix': 'fix',
  'bugfix': 'fix',
  'enhancement': 'feat',
  'feature': 'feat',
  'feat': 'feat',
  'documentation': 'docs',
  'docs': 'docs',
  'refactor': 'refactor',
  'refactoring': 'refactor',
  'tech-debt': 'refactor',
  'performance': 'perf',
  'perf': 'perf',
  'test': 'test',
  'testing': 'test',
  'ci': 'ci',
  'build': 'build',
  'chore': 'chore',
  'maintenance': 'chore',
  'style': 'style'
}

const branchName = computed(() => {
  if (props.issue.headRef) return props.issue.headRef

  const slug = props.issue.title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
    .replace(/-$/, '')

  const type = props.issue.labels
    ?.map(l => labelToType[l.name.toLowerCase()])
    .find(Boolean)
    ?? 'feat'

  return `${type}/${props.issue.number}-${slug}`
})

function copyGitBranch() {
  copy(branchName.value)
  toast.add({ title: `Copied ${branchName.value} to clipboard`, icon: 'i-lucide-copy' })
}

function navigateToLinkedItem(item: { id: number, number: number, title: string, state: string, htmlUrl: string | null }, isPullRequest: boolean) {
  const repo = props.issue.repository
  if (!repo) return

  selectIssue({
    id: item.id,
    number: item.number,
    title: item.title,
    state: item.state,
    stateReason: null,
    pullRequest: isPullRequest,
    draft: null,
    merged: null,
    htmlUrl: item.htmlUrl,
    repository: {
      id: repo.id,
      name: repo.fullName.split('/')[1]!,
      fullName: repo.fullName
    }
  })
  navigateTo(isPullRequest ? '/pulls' : '/issues')
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
const pendingLabels = ref<LabelItem[]>([])

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
    pendingLabels.value = [...selectedLabels.value]
    fetchLabels()
  } else {
    persistLabels()
  }
}

async function persistLabels() {
  const currentIds = new Set(props.issue.labels?.map(l => l.id) ?? [])
  const newIds = new Set(pendingLabels.value.map(l => l.id))

  const added = pendingLabels.value.filter(l => !currentIds.has(l.id))
  const removed = (props.issue.labels ?? []).filter(l => !newIds.has(l.id))

  if (!added.length && !removed.length) return

  try {
    for (const label of added) {
      await $fetch(`/api/repositories/${repoPath.value.owner}/${repoPath.value.name}/issues/${props.issue.number}/labels`, {
        method: 'POST',
        body: { labelId: label.id }
      })
    }
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
const pendingAssignees = ref<UserItem[]>([])

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
    pendingAssignees.value = [...selectedAssignees.value]
    fetchAssignees()
  } else {
    persistAssignees()
  }
}

async function persistAssignees() {
  const currentIds = new Set(props.issue.assignees?.map(u => u.id) ?? [])
  const newIds = new Set(pendingAssignees.value.map(u => u.id))

  const added = pendingAssignees.value.filter(u => !currentIds.has(u.id))
  const removed = (props.issue.assignees ?? []).filter(u => !newIds.has(u.id))

  if (!added.length && !removed.length) return

  try {
    for (const user of added) {
      await $fetch(`/api/repositories/${repoPath.value.owner}/${repoPath.value.name}/issues/${props.issue.number}/assignees`, {
        method: 'POST',
        body: { userId: user.id, login: user.login }
      })
    }
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
const pendingReviewers = ref<UserItem[]>([])

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
    pendingReviewers.value = [...selectedReviewers.value]
    fetchReviewers()
  } else {
    persistReviewers()
  }
}

async function persistReviewers() {
  const currentIds = new Set(props.issue.requestedReviewers?.map(u => u.id) ?? [])
  const newIds = new Set(pendingReviewers.value.map(u => u.id))

  const added = pendingReviewers.value.filter(u => !currentIds.has(u.id))
  const removed = (props.issue.requestedReviewers ?? []).filter(u => !newIds.has(u.id))

  if (!added.length && !removed.length) return

  try {
    for (const user of added) {
      await $fetch(`/api/repositories/${repoPath.value.owner}/${repoPath.value.name}/issues/${props.issue.number}/reviewers`, {
        method: 'POST',
        body: { userId: user.id, login: user.login }
      })
    }
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

// State change dropdown items (issues only)
const stateItems = computed<DropdownMenuItem[][]>(() => {
  if (props.issue.pullRequest) return []

  if (props.issue.state === 'open') {
    return [[
      {
        label: 'Close as completed',
        icon: 'i-lucide-circle-check',
        ui: { itemLeadingIcon: 'text-important group-data-highlighted:text-important' },
        onSelect: () => emit('close-issue', 'completed')
      },
      {
        label: 'Close as not planned',
        icon: 'i-lucide-circle-slash',
        onSelect: () => emit('close-issue', 'not_planned')
      },
      {
        label: 'Close as duplicate',
        icon: 'i-lucide-copy',
        onSelect: () => emit('close-as-duplicate')
      }
    ]]
  }

  return [[
    {
      label: 'Reopen issue',
      icon: 'i-lucide-circle-dot',
      onSelect: () => emit('reopen-issue')
    }
  ]]
})
</script>

<template>
  <div class="flex flex-col gap-3 -mx-1.5">
    <!-- Properties -->
    <div class="flex flex-col gap-1">
      <span class="text-xs/6 text-muted font-medium px-1.5">Properties</span>

      <!-- State -->
      <div class="flex items-center gap-1 justify-between">
        <UDropdownMenu
          v-if="!issue.pullRequest && !readonly"
          v-slot="{ open }"
          :items="stateItems"
          :ui="{ content: 'w-[calc(var(--reka-dropdown-menu-trigger-width)+4px)]' }"
        >
          <UButton
            :icon="stateIcon"
            :label="`${stateLabel} issue`"
            variant="ghost"
            :ui="{ leadingIcon: `text-${stateColor}` }"
            class="text-sm/4 pl-2 pr-0 flex-1"
            :class="[open && 'bg-elevated']"
          />
        </UDropdownMenu>

        <UButton
          v-else
          as="div"
          :icon="stateIcon"
          :label="`${stateLabel} ${issue.pullRequest ? 'pull request' : 'issue'}`"
          variant="ghost"
          :ui="{ leadingIcon: `text-${stateColor}` }"
          class="text-sm/4 hover:bg-transparent active:bg-transparent pl-2 pr-0"
        />

        <div class="flex items-center ms-auto -my-1.5">
          <UTooltip text="Copy URL" :kbds="['meta', 'shift', ',']">
            <UButton
              icon="i-lucide-link"
              variant="ghost"
              @click.stop="copyIssueUrl"
            />
          </UTooltip>

          <UTooltip text="Copy number" :kbds="['meta', '.']">
            <UButton
              icon="i-lucide-hash"
              variant="ghost"
              @click.stop="copyIssueNumber"
            />
          </UTooltip>

          <UTooltip text="Copy branch" :kbds="['meta', 'shift', '.']">
            <UButton
              icon="i-lucide-git-branch"
              variant="ghost"
              @click.stop="copyGitBranch"
            />
          </UTooltip>
        </div>
      </div>

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

      <!-- Resolution status (issues only) -->
      <UButton
        v-if="!issue.pullRequest && resolutionConfig"
        :as="issue.resolutionAnswerCommentId ? 'button' : 'div'"
        :icon="resolutionConfig.icon"
        :trailing-icon="issue.resolutionAnswerCommentId ? 'i-lucide-arrow-right' : ''"
        :ui="{ leadingIcon: `text-${resolutionConfig.color}`, trailingIcon: 'ms-auto' }"
        variant="ghost"
        :class="[
          'text-sm/4 px-2',
          !issue.resolutionAnswerCommentId && 'hover:bg-transparent active:bg-transparent'
        ]"
        @click="issue.resolutionAnswerCommentId && emit('scroll-to-answer', issue.resolutionAnswerCommentId)"
      >
        <span class="truncate">
          {{ resolutionConfig.label }}
          <span v-if="issue.resolutionConfidence" class="text-muted italic text-xs">
            ({{ issue.resolutionConfidence }}% confidence)
          </span>
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
          v-if="!readonly"
          :model-value="pendingLabels"
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
          @update:model-value="pendingLabels = $event"
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
          v-if="!readonly"
          :model-value="pendingAssignees"
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
          @update:model-value="pendingAssignees = $event"
          @update:open="handleAssigneesOpen"
        >
          <template #default>
            Add
          </template>

          <template #item-leading="{ item }">
            <UAvatar
              :src="item.avatarUrl!"
              :alt="item.login"
              size="3xs"
              loading="lazy"
            />
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
            src: reviewer.avatarUrl || `https://github.com/${reviewer.login}.png`,
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
          v-if="!readonly"
          :model-value="pendingReviewers"
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
          @update:model-value="pendingReviewers = $event"
          @update:open="handleReviewersOpen"
        >
          <template #default>
            Add
          </template>
          <template #item-leading="{ item }">
            <UAvatar
              :src="item.avatarUrl!"
              :alt="item.login"
              size="3xs"
              loading="lazy"
            />
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
          icon="i-lucide-git-pull-request"
          :ui="{ leadingIcon: 'text-success' }"
          variant="ghost"
          class="text-sm/4 px-2"
          @click="navigateToLinkedItem(pr, true)"
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
          :icon="linkedIssue.state === 'open' ? 'i-lucide-circle-dot' : 'i-lucide-circle-check'"
          :ui="{ leadingIcon: linkedIssue.state === 'open' ? 'text-success' : 'text-important' }"
          variant="ghost"
          class="text-sm/4 px-2"
          @click="navigateToLinkedItem(linkedIssue, false)"
        >
          <span class="text-muted font-normal">#{{ linkedIssue.number }}</span>
          <span class="truncate">{{ linkedIssue.title }}</span>
        </UButton>
      </div>
    </div>
  </div>
</template>
