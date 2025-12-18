<script setup lang="ts">
useSeoMeta({
  title: 'Dashboard'
})

const route = useRoute()
const router = useRouter()

// Tab state from URL query
const activeTab = computed({
  get: () => (route.query.tab as string) || 'issues',
  set: (value) => {
    router.replace({ query: { ...route.query, tab: value } })
  }
})

const tabs = [
  { label: 'Issues', value: 'issues', icon: 'i-octicon-issue-opened-16' },
  { label: 'Pull Requests', value: 'pull-requests', icon: 'i-octicon-git-pull-request-16' }
]

// Fetch all endpoints in parallel
// PR endpoints
const { data: myPullRequests, refresh: refreshMyPRs, status: myPRsStatus } = await useLazyFetch('/api/dashboard/my-pull-requests')
const { data: reviewRequested, refresh: refreshReviewRequested, status: reviewRequestedStatus } = await useLazyFetch('/api/dashboard/review-requested')
const { data: dependencyUpdates, refresh: refreshDependencyUpdates, status: dependencyUpdatesStatus } = await useLazyFetch('/api/dashboard/dependency-updates')
const { data: readyToMerge, refresh: refreshReadyToMerge, status: readyToMergeStatus } = await useLazyFetch('/api/dashboard/ready-to-merge')
const { data: waitingOnAuthor, refresh: refreshWaitingOnAuthor, status: waitingOnAuthorStatus } = await useLazyFetch('/api/dashboard/waiting-on-author')
// Issue endpoints
const { data: assignedToMe, refresh: refreshAssignedToMe, status: assignedToMeStatus } = await useLazyFetch('/api/dashboard/assigned-to-me')
const { data: hotIssues, refresh: refreshHotIssues, status: hotIssuesStatus } = await useLazyFetch('/api/dashboard/hot-issues')
const { data: priorityBugs, refresh: refreshPriorityBugs, status: priorityBugsStatus } = await useLazyFetch('/api/dashboard/priority-bugs')
const { data: needsTriage, refresh: refreshNeedsTriage, status: needsTriageStatus } = await useLazyFetch('/api/dashboard/needs-triage')
const { data: canBeClosed, refresh: refreshCanBeClosed, status: canBeClosedStatus } = await useLazyFetch('/api/dashboard/can-be-closed')

// We also need to check if user has favorites
const { data: favoriteRepos, refresh: refreshFavoriteRepos } = await useFetch('/api/favorites/repositories', { default: () => [] })
const hasFavorites = computed(() => favoriteRepos.value && favoriteRepos.value.length > 0)

const isInitialLoading = computed(() =>
  myPRsStatus.value === 'pending'
  && reviewRequestedStatus.value === 'pending'
  && dependencyUpdatesStatus.value === 'pending'
  && readyToMergeStatus.value === 'pending'
  && waitingOnAuthorStatus.value === 'pending'
  && assignedToMeStatus.value === 'pending'
  && hotIssuesStatus.value === 'pending'
  && priorityBugsStatus.value === 'pending'
  && needsTriageStatus.value === 'pending'
  && canBeClosedStatus.value === 'pending'
)

function refresh() {
  refreshFavoriteRepos()
  refreshMyPRs()
  refreshReviewRequested()
  refreshDependencyUpdates()
  refreshReadyToMerge()
  refreshWaitingOnAuthor()
  refreshAssignedToMe()
  refreshHotIssues()
  refreshPriorityBugs()
  refreshNeedsTriage()
  refreshCanBeClosed()
}

// Refresh data when window gains focus
const visibility = useDocumentVisibility()
watch(visibility, (isVisible) => {
  if (isVisible) {
    refresh()
  }
})

// Favorites slideover state
const favoritesOpen = ref(false)

function openFavorites() {
  favoritesOpen.value = true
}
</script>

<template>
  <UDashboardPanel id="dashboard" :ui="{ body: 'overflow-hidden' }">
    <template #header>
      <UDashboardNavbar title="Dashboard" :ui="{ left: 'gap-3' }">
        <template v-if="hasFavorites" #trailing>
          <UFieldGroup>
            <UButton
              v-for="tab in tabs"
              :key="tab.value"
              :label="tab.label"
              color="neutral"
              variant="outline"
              active-variant="subtle"
              :active="activeTab === tab.value"
              :class="[activeTab === tab.value ? 'hover:bg-elevated' : '']"
              @click="activeTab = tab.value"
            />
          </UFieldGroup>
        </template>

        <template v-if="hasFavorites" #right>
          <UButton
            color="neutral"
            variant="soft"
            icon="i-lucide-star"
            :label="!hasFavorites ? 'Select favorites' : `${favoriteRepos.length} favorites`"
            @click="favoritesOpen = true"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <LazyDashboardFavorites v-model:open="favoritesOpen" :favorites="favoriteRepos ?? []" @change="refresh" />

      <!-- Loading state -->
      <div v-if="isInitialLoading" class="flex-1 flex flex-col items-center justify-center">
        <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-muted" />
      </div>

      <!-- No favorites selected -->
      <UEmpty
        v-else-if="!hasFavorites"
        icon="i-lucide-star"
        title="Select your favorite repositories"
        description="Choose the repositories you want to focus on. Your dashboard will show PRs, issues, and activity from these repositories."
        variant="naked"
        size="lg"
        class="flex-1"
        :ui="{ header: 'max-w-md' }"
        :actions="[{
          label: 'Select favorites',
          icon: 'i-lucide-star',
          color: 'neutral',
          variant: 'soft',
          size: 'sm',
          onClick: openFavorites
        }]"
      />

      <!-- Pull Requests Tab -->
      <div v-else-if="activeTab === 'pull-requests'" class="grid grid-cols-5 gap-4 min-h-0 flex-1">
        <DashboardSection
          title="My Pull Requests"
          icon="i-octicon-git-pull-request-16"
          :count="myPullRequests?.length"
          :loading="myPRsStatus === 'pending'"
          empty-text="No open PRs authored by you"
        >
          <DashboardItem
            v-for="pr in myPullRequests"
            :key="pr.id"
            :item="pr"
          />
        </DashboardSection>

        <DashboardSection
          title="Review Requested"
          icon="i-octicon-code-review-16"
          :count="reviewRequested?.length"
          :loading="reviewRequestedStatus === 'pending'"
          empty-text="No pending review requests"
        >
          <DashboardItem
            v-for="pr in reviewRequested"
            :key="pr.id"
            :item="pr"
            show-author
          />
        </DashboardSection>

        <DashboardSection
          title="Ready to Merge"
          icon="i-lucide-check-circle"
          :count="readyToMerge?.length"
          :loading="readyToMergeStatus === 'pending'"
          empty-text="No PRs ready to merge"
        >
          <DashboardItem
            v-for="pr in readyToMerge"
            :key="pr.id"
            :item="pr"
            show-author
          />
        </DashboardSection>

        <DashboardSection
          title="Waiting on Author"
          icon="i-lucide-clock"
          :count="waitingOnAuthor?.length"
          :loading="waitingOnAuthorStatus === 'pending'"
          empty-text="No PRs waiting on author"
        >
          <DashboardItem
            v-for="pr in waitingOnAuthor"
            :key="pr.id"
            :item="pr"
            show-author
          />
        </DashboardSection>

        <DashboardSection
          title="Dependency Updates"
          icon="i-octicon-dependabot-16"
          :count="dependencyUpdates?.length"
          :loading="dependencyUpdatesStatus === 'pending'"
          empty-text="No dependency update PRs"
        >
          <DashboardItem
            v-for="pr in dependencyUpdates"
            :key="pr.id"
            :item="pr"
            show-author
          />
        </DashboardSection>
      </div>

      <!-- Issues Tab -->
      <div v-else-if="activeTab === 'issues'" class="grid grid-cols-5 gap-4 min-h-0 flex-1">
        <DashboardSection
          title="Assigned to Me"
          icon="i-lucide-user-check"
          :count="assignedToMe?.length"
          :loading="assignedToMeStatus === 'pending'"
          empty-text="No issues assigned to you"
        >
          <DashboardItem
            v-for="item in assignedToMe"
            :key="item.id"
            :item="item"
          />
        </DashboardSection>

        <DashboardSection
          title="Needs Triage"
          icon="i-lucide-tag"
          :count="needsTriage?.length"
          :loading="needsTriageStatus === 'pending'"
          empty-text="No issues need triage"
        >
          <DashboardItem
            v-for="issue in needsTriage"
            :key="issue.id"
            :item="issue"
          />
        </DashboardSection>

        <DashboardSection
          title="Hot Issues"
          icon="i-lucide-flame"
          :count="hotIssues?.length"
          :loading="hotIssuesStatus === 'pending'"
          empty-text="No issues with high engagement"
        >
          <DashboardItem
            v-for="issue in hotIssues"
            :key="issue.id"
            :item="issue"
          />
        </DashboardSection>

        <DashboardSection
          title="Priority Bugs"
          icon="i-lucide-bug"
          :count="priorityBugs?.length"
          :loading="priorityBugsStatus === 'pending'"
          empty-text="No priority bugs found"
        >
          <DashboardItem
            v-for="issue in priorityBugs"
            :key="issue.id"
            :item="issue"
          />
        </DashboardSection>

        <DashboardSection
          title="Can Be Closed"
          icon="i-lucide-check-circle"
          :count="canBeClosed?.length"
          :loading="canBeClosedStatus === 'pending'"
          empty-text="No issues ready to close"
        >
          <DashboardItem
            v-for="issue in canBeClosed"
            :key="issue.id"
            :item="issue"
          />
        </DashboardSection>
      </div>
    </template>
  </UDashboardPanel>
</template>
