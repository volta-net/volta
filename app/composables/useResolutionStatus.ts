import type { BadgeProps } from '@nuxt/ui'
import type { ResolutionStatus } from '#shared/types'

const resolutionStatusConfigs: Record<ResolutionStatus, BadgeProps> = {
  answered: {
    icon: 'i-lucide-message-circle-heart',
    color: 'success',
    label: 'Answered'
  },
  likely_resolved: {
    icon: 'i-lucide-message-circle-question-mark',
    color: 'success',
    label: 'Likely resolved'
  },
  waiting_on_author: {
    icon: 'i-lucide-message-circle-more',
    color: 'warning',
    label: 'Waiting on author'
  },
  needs_attention: {
    icon: 'i-lucide-message-circle-dashed',
    color: 'important',
    label: 'Needs attention'
  }
}

export function useResolutionStatus() {
  function getConfig(status: ResolutionStatus | null | undefined): BadgeProps | null {
    if (!status) return null
    return resolutionStatusConfigs[status] || null
  }

  return {
    configs: resolutionStatusConfigs,
    getConfig
  }
}
