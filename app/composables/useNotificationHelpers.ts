import type { Notification } from '#shared/types/notification'
import { getIssueStateIcon, getIssueStateColor } from './useIssueState'

export function useNotificationHelpers() {
  function getIcon(notification: Notification) {
    const { type, action } = notification

    // Release notifications
    if (type === 'release') {
      return 'i-octicon-tag-24'
    }

    // Workflow run notifications
    if (type === 'workflow_run') {
      if (action === 'failed') return 'i-octicon-x-circle-24'
      if (action === 'success') return 'i-octicon-check-circle-24'
      return 'i-octicon-play-24'
    }

    // Issue/PR - reuse shared utility
    if (!notification.issue) return 'i-octicon-bell-24'
    return getIssueStateIcon(notification.issue, 24)
  }

  function getColor(notification: Notification) {
    const { type, action } = notification

    // Release notifications
    if (type === 'release') {
      return 'text-emerald-400'
    }

    // Workflow run notifications
    if (type === 'workflow_run') {
      if (action === 'failed') return 'text-red-400'
      if (action === 'success') return 'text-emerald-400'
      return 'text-gray-400'
    }

    // Issue/PR - reuse shared utility
    if (!notification.issue) return 'text-muted'
    return getIssueStateColor(notification.issue)
  }

  function getTitle(notification: Notification) {
    const { type } = notification

    if (type === 'release' && notification.release) {
      return notification.release.name || notification.release.tagName
    }

    if (type === 'workflow_run' && notification.workflowRun) {
      return notification.workflowRun.name || notification.workflowRun.workflowName || 'Workflow'
    }

    return notification.issue?.title ?? 'Notification'
  }

  function getPrefix(notification: Notification) {
    const { type } = notification

    if (type === 'release' && notification.release) {
      return notification.release.tagName
    }

    if (type === 'workflow_run' && notification.workflowRun) {
      return notification.workflowRun.workflowName
    }

    if (notification.issue) {
      return `#${notification.issue.number}`
    }

    return null
  }

  function getActionLabel(action: Notification['action']) {
    switch (action) {
      case 'opened':
        return 'Opened'
      case 'reopened':
        return 'Reopened'
      case 'closed':
        return 'Closed'
      case 'merged':
        return 'Merged'
      case 'assigned':
        return 'Assigned'
      case 'mentioned':
        return 'Mentioned'
      case 'comment':
        return 'Commented'
      case 'review_requested':
        return 'Review requested'
      case 'review_submitted':
        return 'Reviewed'
      case 'review_dismissed':
        return 'Review dismissed'
      case 'ready_for_review':
        return 'Ready for review'
      case 'published':
        return 'Published'
      case 'failed':
        return 'Failed'
      case 'success':
        return 'Success'
      default:
        return null
    }
  }

  function getActionIcon(notification: Notification) {
    const { type, action } = notification

    // Release specific icons
    if (type === 'release') {
      return 'i-octicon-tag-16'
    }

    // Workflow run specific icons
    if (type === 'workflow_run') {
      if (action === 'failed') return 'i-octicon-x-circle-16'
      if (action === 'success') return 'i-octicon-check-circle-16'
      return 'i-octicon-play-16'
    }

    // Pull request specific icons
    if (type === 'pull_request') {
      switch (action) {
        case 'opened':
          return 'i-octicon-git-pull-request-16'
        case 'reopened':
          return 'i-octicon-git-pull-request-16'
        case 'closed':
          return 'i-octicon-git-pull-request-closed-16'
        case 'merged':
          return 'i-octicon-git-merge-16'
        case 'review_requested':
          return 'i-octicon-eye-16'
        case 'review_submitted':
          return 'i-octicon-check-circle-16'
        case 'review_dismissed':
          return 'i-octicon-x-16'
        case 'ready_for_review':
          return 'i-octicon-git-pull-request-16'
        case 'comment':
          return 'i-octicon-comment-16'
        case 'mentioned':
          return 'i-octicon-mention-16'
        case 'assigned':
          return 'i-octicon-person-16'
      }
    }

    // Issue specific icons
    if (type === 'issue') {
      switch (action) {
        case 'opened':
          return 'i-octicon-issue-opened-16'
        case 'reopened':
          return 'i-octicon-issue-reopened-16'
        case 'closed':
          return 'i-octicon-issue-closed-16'
        case 'comment':
          return 'i-octicon-comment-16'
        case 'mentioned':
          return 'i-octicon-mention-16'
        case 'assigned':
          return 'i-octicon-person-16'
      }
    }

    return 'i-octicon-bell-16'
  }

  return {
    getIcon,
    getColor,
    getTitle,
    getPrefix,
    getActionLabel,
    getActionIcon
  }
}
