import type { Notification } from '#shared/types/notification'
import { getIssueStateIcon, getIssueStateColor } from './useIssueState'
import { getWorkflowStateIcon, getWorkflowStateColor } from './useWorkflowState'
import { getReleaseStateIcon, getReleaseStateColor } from './useReleaseState'

export function useNotificationHelpers() {
  function getIcon(notification: Notification) {
    const { type } = notification

    // Release notifications
    if (type === 'release') {
      return getReleaseStateIcon(notification.release)
    }

    // Workflow run notifications
    if (type === 'workflow_run' && notification.workflowRun) {
      return getWorkflowStateIcon(notification.workflowRun.conclusion)
    }

    // Issue/PR - reuse shared utility
    if (!notification.issue) return 'i-octicon-bell-16'
    return getIssueStateIcon(notification.issue)
  }

  function getColor(notification: Notification) {
    const { type } = notification

    // Release notifications
    if (type === 'release') {
      return getReleaseStateColor(notification.release)
    }

    // Workflow run notifications
    if (type === 'workflow_run' && notification.workflowRun) {
      return getWorkflowStateColor(notification.workflowRun.conclusion)
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

  function getActionVerb(action: Notification['action']) {
    switch (action) {
      case 'opened':
        return 'opened'
      case 'reopened':
        return 'reopened'
      case 'closed':
        return 'closed'
      case 'merged':
        return 'merged'
      case 'assigned':
        return 'assigned you to'
      case 'mentioned':
        return 'mentioned you in'
      case 'comment':
        return 'commented'
      case 'review_requested':
        return 'requested your review on'
      case 'review_submitted':
        return 'reviewed'
      case 'review_dismissed':
        return 'dismissed a review on'
      case 'ready_for_review':
        return 'marked as ready for review'
      case 'published':
        return 'published'
      case 'failed':
        return 'failed'
      case 'success':
        return 'succeeded'
      default:
        return 'updated'
    }
  }

  function getSubjectLabel(type: Notification['type']) {
    switch (type) {
      case 'pull_request':
        return 'pull request'
      case 'issue':
        return 'issue'
      case 'release':
        return 'release'
      case 'workflow_run':
        return 'workflow'
      default:
        return null
    }
  }

  return {
    getIcon,
    getColor,
    getTitle,
    getPrefix,
    getActionLabel,
    getActionVerb,
    getSubjectLabel
  }
}
