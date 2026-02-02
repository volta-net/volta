<script setup lang="ts">
import type { Notification } from '#shared/types'
import type { Filter } from '~/composables/useFilters'

const props = defineProps<{
  notification: Notification
  selected: boolean
  activeFilters?: readonly Filter[]
}>()

const emit = defineEmits<{
  filter: [filter: Filter]
}>()

const { getIcon, getColor, getPrefix, getTitle, getActionLabel, getActionIcon } = useNotificationHelpers()

function isFilterActive(type: Filter['type'], value: string) {
  return props.activeFilters?.some(f => f.type === type && f.value === value) ?? false
}

// Get state config for filtering (only for issue/PR notifications)
const stateConfig = computed(() => {
  const { type, issue } = props.notification
  if (type !== 'issue' && type !== 'pull_request') return null
  return getIssueState(issue, type === 'pull_request')
})
</script>

<template>
  <div
    class="relative px-3 py-2.5 cursor-default before:absolute before:z-[-1] before:inset-px before:rounded-md before:transition-colors transition-colors"
    :class="[
      selected ? 'before:bg-elevated' : 'hover:before:bg-elevated/50'
    ]"
  >
    <div class="flex-1 flex flex-col gap-1 min-w-0">
      <div class="flex items-center gap-1.5" :class="{ 'opacity-70': notification.read }">
        <UIcon
          :name="getIcon(notification)"
          :class="[
            `text-${getColor(notification)}`
          ]"
          class="size-4 shrink-0"
          @click.stop="stateConfig && emit('filter', { type: 'state', value: stateConfig.key, label: stateConfig.label, icon: getIcon(notification) })"
        />
        <p class="truncate flex-1 text-sm/6">
          <span class="text-muted">{{ getPrefix(notification) }}&nbsp;</span>
          <span class="text-highlighted" :class="{ 'font-medium': !notification.read }">{{ getTitle(notification) }}</span>
        </p>
        <span v-if="!notification.read" class="size-2 rounded-full bg-primary shrink-0 m-1" />
      </div>

      <div class="flex items-start gap-1.5" :class="{ 'opacity-60': notification.read }">
        <div class="flex flex-wrap items-center gap-1">
          <FiltersButton
            v-if="notification.actor"
            :filter="{
              type: 'actor',
              value: notification.actor.login,
              label: notification.actor.login,
              avatar: notification.actor.avatarUrl
            }"
            :active="isFilterActive('actor', notification.actor.login)"
            @click.stop="emit('filter', { type: 'actor', value: notification.actor.login, label: notification.actor.login, avatar: notification.actor.avatarUrl! })"
          />
          <FiltersButton
            :filter="{
              type: 'action',
              value: notification.action!,
              label: getActionLabel(notification),
              icon: getActionIcon(notification)
            }"
            :active="isFilterActive('action', notification.action!)"
            @click.stop="emit('filter', { type: 'action', value: notification.action!, label: getActionLabel(notification), icon: getActionIcon(notification) })"
          />
          <FiltersButton
            v-if="notification.repository"
            :filter="{
              type: 'repository',
              value: notification.repository.name,
              label: notification.repository.name,
              avatar: `https://github.com/${notification.repository.fullName.split('/')[0]}.png`
            }"
            :active="isFilterActive('repository', notification.repository.name)"
            @click.stop="emit('filter', { type: 'repository', value: notification.repository.name, label: notification.repository.name, avatar: `https://github.com/${notification.repository.fullName.split('/')[0]}.png` })"
          />
        </div>

        <span class="shrink-0 ms-auto text-sm/6 text-dimmed">
          {{ useRelativeTime(new Date(notification.createdAt)) }}
        </span>
      </div>
    </div>
  </div>
</template>
