<script setup lang="ts">
useSeoMeta({
  title: 'Dashboard'
})

const { data: dashboard, refresh, status } = await useLazyFetch('/api/dashboard')

// Refresh data when window gains focus
const visibility = useDocumentVisibility()
watch(visibility, (isVisible) => {
  if (isVisible) {
    refresh()
  }
})
</script>

<template>
  <UDashboardPanel id="dashboard" :ui="{ body: 'overflow-hidden' }">
    <template #header>
      <UDashboardNavbar title="Dashboard">
        <template #right>
          <DashboardFavoritesMenu @change="refresh" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <!-- Loading state -->
      <div v-if="status === 'pending'" class="flex-1 flex flex-col items-center justify-center">
        <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-muted" />
      </div>

      <!-- No favorites selected -->
      <div v-else-if="!dashboard?.hasFavorites" class="flex-1 flex flex-col items-center justify-center text-center">
        <div class="size-16 rounded-full bg-elevated flex items-center justify-center mb-4">
          <UIcon name="i-lucide-star" class="size-8 text-muted" />
        </div>
        <h2 class="text-lg font-semibold mb-2">
          Select your favorite repositories
        </h2>
        <p class="text-muted text-sm max-w-md mb-6">
          Choose the repositories you want to focus on. Your dashboard will show PRs, issues, and activity from these repositories.
        </p>
        <DashboardFavoritesMenu @change="refresh" />
      </div>

      <div v-else class="grid grid-cols-7 gap-4 min-h-0">
        <DashboardSection
          title="My Pull Requests"
          icon="i-octicon-git-pull-request-16"
          :count="dashboard.myPullRequests.length"
          empty-text="No open PRs authored by you"
        >
          <DashboardItem
            v-for="pr in dashboard.myPullRequests"
            :key="pr.id"
            :item="pr"
          />
        </DashboardSection>

        <DashboardSection
          title="Review Requested"
          icon="i-octicon-code-review-16"
          :count="dashboard.reviewRequested.length"
          empty-text="No pending review requests"
        >
          <DashboardItem
            v-for="pr in dashboard.reviewRequested"
            :key="pr.id"
            :item="pr"
            show-author
          />
        </DashboardSection>

        <DashboardSection
          title="Dependency Updates"
          icon="i-octicon-dependabot-16"
          :count="dashboard.renovatePRs.length"
          empty-text="No dependency update PRs"
        >
          <DashboardItem
            v-for="pr in dashboard.renovatePRs"
            :key="pr.id"
            :item="pr"
            show-author
            show-c-i-status
          />
        </DashboardSection>

        <DashboardSection
          title="Assigned to Me"
          icon="i-lucide-user-check"
          :count="dashboard.assignedToMe.length"
          empty-text="No issues or PRs assigned to you"
        >
          <DashboardItem
            v-for="item in dashboard.assignedToMe"
            :key="item.id"
            :item="item"
          />
        </DashboardSection>

        <DashboardSection
          title="Hot Issues"
          icon="i-lucide-flame"
          :count="dashboard.hotIssues.length"
          empty-text="No issues with high engagement"
        >
          <DashboardItem
            v-for="issue in dashboard.hotIssues"
            :key="issue.id"
            :item="issue"
          />
        </DashboardSection>

        <DashboardSection
          title="Priority Bugs"
          icon="i-lucide-bug"
          :count="dashboard.priorityBugs.length"
          empty-text="No priority bugs found"
        >
          <DashboardItem
            v-for="issue in dashboard.priorityBugs"
            :key="issue.id"
            :item="issue"
          />
        </DashboardSection>

        <DashboardSection
          title="Recommended Today"
          icon="i-lucide-lightbulb"
          :count="dashboard.recommendedToday.length"
          empty-text="No recommendations available"
        >
          <DashboardItem
            v-for="issue in dashboard.recommendedToday"
            :key="issue.id"
            :item="issue"
          />
        </DashboardSection>
      </div>
    </template>
  </UDashboardPanel>
</template>
