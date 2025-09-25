<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { breakpointsTailwind } from '@vueuse/core'

const tabItems = [{
  label: 'All',
  value: 'all'
}, {
  label: 'Unread',
  value: 'unread'
}]
const selectedTab = ref('all')

const store = useStore()

const { data: notifications } = await store.notifications.query(q => q.many({ fetchPolicy: 'cache-and-fetch' }))

// Filter mails based on the selected tab
const filteredNotifications = computed(() => {
  if (selectedTab.value === 'unread') {
    return notifications.value.filter(notification => !!notification.unread)
  }

  return notifications.value
})

const selectedNotification = ref<Notification | null>()

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

// Reset selected notification if it's not in the filtered notifications
watch(filteredNotifications, () => {
  if (!filteredNotifications.value.find(notification => notification.id === selectedNotification.value?.id)) {
    selectedNotification.value = null
  }
})

const breakpoints = useBreakpoints(breakpointsTailwind)
const isMobile = breakpoints.smaller('lg')
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
        <UBadge
          :label="filteredNotifications.length"
          variant="subtle"
          color="neutral"
          size="sm"
        />
      </template>

      <template #right>
        <UTabs
          v-model="selectedTab"
          :items="tabItems"
          :content="false"
          size="xs"
          color="neutral"
        />
      </template>
    </UDashboardNavbar>
    <NotificationsList
      v-model="selectedNotification"
      :notifications="filteredNotifications"
    />
  </UDashboardPanel>

  <!-- <NotificationView
    v-if="selectedNotification"
    :notification="selectedNotification"
    @close="selectedNotification = null"
  /> -->
  <div
    class="hidden lg:flex flex-1 items-center justify-center"
  >
    <UIcon
      name="i-lucide-inbox"
      class="size-32 text-dimmed"
    />
  </div>

  <ClientOnly>
    <USlideover
      v-if="isMobile"
      v-model:open="isPanelOpen"
    >
      <template #content>
        <!-- <InboxNotification
          v-if="selectedNotification"
          :notification="selectedNotification"
          @close="selectedNotification = null"
        /> -->
      </template>
    </USlideover>
  </ClientOnly>
</template>
