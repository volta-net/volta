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
 * Get relative time - can be used in script or directly in templates
 */
export function useRelativeTime(date: MaybeRefOrGetter<Date>) {
  return useTimeAgo(date, { messages })
}
