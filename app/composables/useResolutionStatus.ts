import type { BadgeProps } from '@nuxt/ui'
import type { ResolutionStatus, SuggestedAction } from '#shared/types'

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

export interface ActionConfig {
  icon: string
  color: string
  label: string
  description: string
}

const suggestedActionConfigs: Record<SuggestedAction, ActionConfig> = {
  close_resolved: {
    icon: 'i-lucide-circle-check',
    color: 'success',
    label: 'Close as resolved',
    description: 'This issue has been answered or fixed. Safe to close.'
  },
  close_not_planned: {
    icon: 'i-lucide-circle-slash',
    color: 'neutral',
    label: 'Close as not planned',
    description: 'Not a valid issue, out of scope, or won\'t be fixed.'
  },
  close_duplicate: {
    icon: 'i-lucide-copy',
    color: 'neutral',
    label: 'Close as duplicate',
    description: 'This is a duplicate of another issue.'
  },
  ask_reproduction: {
    icon: 'i-lucide-flask-conical',
    color: 'warning',
    label: 'Ask for reproduction',
    description: 'Missing reproduction steps or insufficient detail.'
  },
  respond: {
    icon: 'i-lucide-message-square-reply',
    color: 'info',
    label: 'Respond',
    description: 'This issue needs a reply from you.'
  },
  none: {
    icon: 'i-lucide-minus',
    color: 'neutral',
    label: 'No action needed',
    description: 'No clear action needed right now.'
  }
}

export function useResolutionStatus() {
  function getConfig(status: ResolutionStatus | null | undefined): BadgeProps | null {
    if (!status) return null
    return resolutionStatusConfigs[status] || null
  }

  function getActionConfig(action: SuggestedAction | string | null | undefined): ActionConfig | null {
    if (!action) return null
    return suggestedActionConfigs[action as SuggestedAction] || null
  }

  return {
    configs: resolutionStatusConfigs,
    actionConfigs: suggestedActionConfigs,
    getConfig,
    getActionConfig
  }
}
