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

    <template #resize-handle="{ onMouseDown, onTouchStart, onDoubleClick }">
      <UDashboardResizeHandle
        class="after:absolute after:inset-y-0 after:right-0 after:w-px hover:after:bg-(--ui-border-accented) after:transition z-1"
        @mousedown="onMouseDown"
        @touchstart="onTouchStart"
        @dblclick="onDoubleClick"
      />
    </template>
  </UDashboardPanel>

  <UDashboardPanel v-if="selectedNotification" id="inbox-2">
    <InboxNotification
      :notification="selectedNotification"
      @close="selectedNotification = null"
      @refresh="refresh"
    />
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
