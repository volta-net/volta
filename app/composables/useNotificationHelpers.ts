import type { Notification } from '#shared/types'
import { getIssueStateIcon, getIssueStateColor } from './useIssueState'
import { getCIStateIcon, getCIStateColor } from './useCIState'
import { getReleaseStateIcon, getReleaseStateColor } from './useReleaseState'

export function useNotificationHelpers() {
  function getIcon(notification: Notification) {
    const { type, issue } = notification

    // Issue/PR present - always show issue/PR state icon
    if (issue) {
      return getIssueStateIcon(issue)
    }

    // Release notifications
    if (type === 'release') {
      return getReleaseStateIcon(notification.release)
    }

    // Workflow run on branch (no PR) - show CI state icon
    if (type === 'workflow_run' && notification.workflowRun) {
      return getCIStateIcon(notification.workflowRun.conclusion)
    }

    return 'i-lucide-bell'
  }

  function getColor(notification: Notification) {
    const { type, issue } = notification

    // Issue/PR present - always show issue/PR state color
    if (issue) {
      return getIssueStateColor(issue)
    }

    // Release notifications
    if (type === 'release') {
      return getReleaseStateColor(notification.release)
    }

    // Workflow run on branch (no PR) - show CI state color
    if (type === 'workflow_run' && notification.workflowRun) {
      return getCIStateColor(notification.workflowRun.conclusion)
    }

    return 'neutral'
  }

  function getTitle(notification: Notification) {
    const { type } = notification

    // Workflow runs: show PR title if PR-triggered, otherwise branch
    if (type === 'workflow_run') {
      if (notification.issue) {
        return notification.issue.title
      }
      return notification.workflowRun?.headBranch || 'Workflow'
    }

    if (notification.issue) {
      return notification.issue.title
    }

    if (type === 'release' && notification.release) {
      return notification.release.name || notification.release.tagName
    }
  }

  function getPrefix(notification: Notification) {
    const { type } = notification

    // Workflow runs: show PR number if PR-triggered, nothing for push-triggered
    if (type === 'workflow_run') {
      if (notification.issue) {
        return `#${notification.issue.number}`
      }
      return null
    }

    if (notification.issue) {
      return `#${notification.issue.number}`
    }

    if (type === 'release' && notification.release) {
      return notification.release.tagName
    }

    return null
  }

  function getActionLabel(notification: Notification) {
    switch (notification.action) {
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
        return ''
    }
  }

  function getActionIcon(notification: Notification) {
    switch (notification.action) {
      case 'opened':
        return notification.type === 'pull_request' ? 'i-lucide-git-pull-request' : 'i-lucide-circle-dot'
      case 'reopened':
        return 'i-lucide-rotate-ccw'
      case 'closed':
        return 'i-lucide-x'
      case 'merged':
        return 'i-lucide-git-merge'
      case 'assigned':
        return 'i-lucide-user-plus'
      case 'mentioned':
        return 'i-lucide-at-sign'
      case 'comment':
        return 'i-lucide-message-square'
      case 'review_requested':
        return 'i-lucide-eye'
      case 'review_submitted':
        return 'i-lucide-file-check'
      case 'review_dismissed':
        return 'i-lucide-file-x'
      case 'ready_for_review':
        return 'i-lucide-check'
      case 'published':
        return 'i-lucide-rocket'
      case 'failed':
        return 'i-lucide-x-circle'
      case 'success':
        return 'i-lucide-check-circle'
      default:
        return 'i-lucide-bell'
    }
  }

  function getActionVerb(notification: Notification) {
    const { action, type, workflowRun } = notification

    // Workflow runs: show workflow name + status
    if (type === 'workflow_run') {
      const workflowName = workflowRun?.workflowName || workflowRun?.name || 'Workflow'
      return action === 'failed' ? `${workflowName} workflow failed` : `${workflowName} workflow succeeded`
    }

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
      default:
        return 'updated'
    }
  }

  function getSubjectLabel(notification: Notification) {
    switch (notification.type) {
      case 'pull_request':
        return 'pull request'
      case 'issue':
        return 'issue'
      case 'release':
        return 'release'
      case 'workflow_run':
        // Subject is included in the action verb for workflows
        return null
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
    getActionIcon,
    getActionVerb,
    getSubjectLabel
  }
}
