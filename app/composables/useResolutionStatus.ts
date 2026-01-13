import type { BadgeProps } from '@nuxt/ui'

type ResolutionStatusConfig = BadgeProps & {
  description: string
}

const resolutionStatusConfigs: Record<ResolutionStatus, ResolutionStatusConfig> = {
  answered: {
    icon: 'i-lucide-check-circle-2',
    color: 'success',
    label: 'Answered',
    description: 'A quality answer has been provided'
  },
  likely_resolved: {
    icon: 'i-lucide-check-circle',
    color: 'success',
    label: 'Likely resolved',
    description: 'Answer provided, no follow-up needed'
  },
  waiting_on_author: {
    icon: 'i-lucide-clock',
    color: 'warning',
    label: 'Waiting on author',
    description: 'Awaiting response from issue author'
  },
  needs_attention: {
    icon: 'i-lucide-alert-circle',
    color: 'important',
    label: 'Needs attention',
    description: 'No quality answer provided yet'
  }
}

export function useResolutionStatus() {
  function getConfig(status: ResolutionStatus | null | undefined): ResolutionStatusConfig | null {
    if (!status) return null
    return resolutionStatusConfigs[status] || null
  }

  return {
    configs: resolutionStatusConfigs,
    getConfig
  }
}
