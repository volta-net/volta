<script setup lang="ts">
import { breakpointsTailwind } from '@vueuse/core'
import type { Notification } from '#shared/types/notification'

const { data: notifications, refresh } = await useFetch<Notification[]>('/api/notifications')

const selectedNotification = ref<Notification | null>()

// Refetch notifications when window regains focus
const focused = useWindowFocus()
watch(focused, (isFocused) => {
  if (isFocused) {
    refresh()
  }
})

const isPanelOpen = computed({
  get() {
    return !!selectedNotification.value
  },
  set(value: boolean) {
    if (!value) {
      selectedNotification.value = null
    }
  }
})

const breakpoints = useBreakpoints(breakpointsTailwind)
const isMobile = breakpoints.smaller('lg')

async function markAllAsRead() {
  await $fetch('/api/notifications/read-all', { method: 'POST' })
  await refresh()
}

async function deleteAll() {
  await $fetch('/api/notifications', { method: 'DELETE' })
  selectedNotification.value = null
  await refresh()
}

async function deleteAllRead() {
  await $fetch('/api/notifications/read', { method: 'DELETE' })
  if (selectedNotification.value?.read) {
    selectedNotification.value = null
  }
  await refresh()
}

// Get title for selected notification
const selectedNotificationTitle = computed(() => {
  const n = selectedNotification.value
  if (!n) return ''

  if (n.issue) {
    return `#${n.issue.number} ${n.issue.title}`
  }
  if (n.release) {
    return n.release.name || n.release.tagName
  }
  if (n.workflowRun) {
    return n.workflowRun.name || n.workflowRun.workflowName || 'Workflow'
  }
  return 'Notification'
})
</script>

<template>
  <UDashboardPanel
    id="inbox-1"
    :default-size="25"
    :min-size="20"
    :max-size="30"
    resizable
  >
    <UDashboardNavbar title="Inbox">
      <template #trailing>
        <UDropdownMenu
          :content="{ align: 'start' }"
          size="sm"
          :items="[[{
            label: 'Mark all as read',
            icon: 'i-lucide-check-circle',
            onSelect: markAllAsRead
          }], [{
            label: 'Delete all',
            icon: 'i-lucide-trash-2',
            onSelect: deleteAll
          }, {
            label: 'Delete all read',
            icon: 'i-lucide-trash-2',
            onSelect: deleteAllRead
          }]]"
        >
          <UButton
            variant="ghost"
            color="neutral"
            size="sm"
            trailing-icon="i-lucide-ellipsis"
            class="data-[state=open]:bg-elevated"
          />
        </UDropdownMenu>
      </template>
    </UDashboardNavbar>

    <InboxNotifications
      v-model="selectedNotification"
      :notifications="notifications ?? []"
      @refresh="refresh"
    />
  </UDashboardPanel>

  <UDashboardPanel v-if="selectedNotification" id="inbox-2">
    <template #header>
      <UDashboardNavbar>
        <template #title>
          {{ selectedNotificationTitle }}
        </template>

        <template #right>
          <UButton
            icon="i-simple-icons-github"
            color="neutral"
            variant="ghost"
            size="sm"
            :to="(selectedNotification.issue?.htmlUrl || selectedNotification.release?.htmlUrl || selectedNotification.workflowRun?.htmlUrl)!"
            target="_blank"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <InboxNotification
        :notification="selectedNotification"
        @close="selectedNotification = null"
        @refresh="refresh"
      />
    </template>
  </UDashboardPanel>

  <UDashboardPanel v-else id="inbox-2" class="hidden lg:flex">
    <template #body>
      <InboxEmpty :notifications="notifications ?? []" />
    </template>
  </UDashboardPanel>

  <ClientOnly>
    <USlideover
      v-if="isMobile && selectedNotification"
      v-model:open="isPanelOpen"
      :title="selectedNotificationTitle"
    >
      <template #content>
        <InboxNotification
          :notification="selectedNotification"
          @close="selectedNotification = null"
          @refresh="refresh"
        />
      </template>
    </USlideover>
  </ClientOnly>
</template>
