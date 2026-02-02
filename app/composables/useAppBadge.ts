import { useState, useFetch, watch } from '#imports'

// Global state for unread notification count
export function useUnreadCount() {
  return useState<number>('unread-notifications', () => 0)
}

export function useAppBadge() {
  const unreadCount = useUnreadCount()

  // Initial fetch to set badge on app load
  useFetch<{ unread: number }>('/api/notifications/count', {
    onResponse({ response }) {
      unreadCount.value = response._data?.unread ?? 0
    }
  })

  // Update badge whenever count changes
  watch(unreadCount, (unread) => {
    if (!('setAppBadge' in navigator)) return

    if (unread > 0) {
      navigator.setAppBadge(unread)
    } else {
      navigator.clearAppBadge()
    }
  }, { immediate: true })
}
