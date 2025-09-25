<script setup lang="ts">
const props = defineProps<{
  notifications: GitHubNotification[]
}>()

const notificationsRefs = ref<Record<string, Element>>({})

const selectedNotification = defineModel<GitHubNotification | null>()

watch(selectedNotification, () => {
  if (!selectedNotification.value) {
    return
  }
  const ref = notificationsRefs.value[selectedNotification.value.id]
  if (ref) {
    ref.scrollIntoView({ block: 'nearest' })
  }
})

defineShortcuts({
  arrowdown: () => {
    const index = props.notifications.findIndex(notification => notification.id === selectedNotification.value?.id)

    if (index === -1) {
      selectedNotification.value = props.notifications[0]
    } else if (index < props.notifications.length - 1) {
      selectedNotification.value = props.notifications[index + 1]
    }
  },
  arrowup: () => {
    const index = props.notifications.findIndex(notification => notification.id === selectedNotification.value?.id)

    if (index === -1) {
      selectedNotification.value = props.notifications[props.notifications.length - 1]
    } else if (index > 0) {
      selectedNotification.value = props.notifications[index - 1]
    }
  }
})
</script>

<template>
  <div class="overflow-y-auto divide-y divide-default">
    <div
      v-for="(notification, index) in notifications"
      :key="index"
      :ref="el => { notificationsRefs[notification.id] = el as Element }"
    >
      <div
        class="p-4 sm:px-6 text-sm cursor-pointer border-l-2 transition-colors"
        :class="[
          selectedNotification && selectedNotification.id === notification.id ? 'border-primary bg-primary/10' : 'border-(--ui-bg) hover:border-primary hover:bg-primary/5'
        ]"
        @click="selectedNotification = notification"
      >
        <div class="flex items-center justify-between flex-1 gap-2 font-medium" :class="[!notification.unread && 'opacity-70']">
          <p class="truncate flex flex-1">
            {{ notification.subject.title }}
          </p>
          <span v-if="notification.unread" class="w-2 h-2 rounded-full bg-inverted flex-shrink-0 cursor-pointer" />
          <time :datatime="notification.updatedAt" class="text-xs font-normal">{{ useTimeAgo(new Date(notification.updatedAt)) }}</time>
        </div>
        <div class="flex items-center justify-between" :class="[notification.unread && 'font-semibold']">
          <UBadge
            class="flex items-center gap-3"
            :label="notification.repository.name"
            variant="outline"
            color="neutral"
          />
        </div>
        <p class="text-dimmed line-clamp-1">
          {{ notification.subject.type }}
        </p>
      </div>
    </div>
  </div>
</template>
