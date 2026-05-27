import type { MaybeRefOrGetter } from 'vue'
import { useTimeAgo } from '#imports'

const messages = {
  justNow: 'now',
  past: (n: string | number) => String(n),
  future: (n: string | number) => String(n),
  month: (n: number) => `${n}mo`,
  year: (n: number) => `${n}y`,
  day: (n: number) => `${n}d`,
  week: (n: number) => `${n}w`,
  hour: (n: number) => `${n}h`,
  minute: (n: number) => `${n}m`,
  second: () => 'now',
  invalid: ''
}

/**
 * Reactive relative time — call in <script setup>, NOT in templates.
 * Each call creates an internal setInterval; calling inside a render
 * function leaks one timer per re-render.
 */
export function useRelativeTime(date: MaybeRefOrGetter<Date>) {
  return useTimeAgo(date, { messages })
}

/**
 * Pure formatter for relative time — safe to call anywhere including
 * templates and v-for loops. Pass a reactive `now` from a shared
 * useNow() to keep the output updating.
 */
export function formatRelativeTime(date: Date | undefined | null, now: Date): string {
  if (!date) return ''
  const diff = now.getTime() - date.getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return 'now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `${weeks}w`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo`
  const years = Math.floor(days / 365)
  return `${years}y`
}
