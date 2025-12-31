import type { DBNotification, DBRelease, DBWorkflowRun, NotificationType, NotificationAction } from './db'
import type { Repository } from './repository'
import type { Issue, User } from './issue'

// Partial types for notification relations (only the fields we need)
type NotificationRepository = Pick<Repository, 'id' | 'name' | 'fullName' | 'htmlUrl'>
type NotificationIssue = Pick<Issue, 'id' | 'pullRequest' | 'number' | 'title' | 'state' | 'stateReason' | 'draft' | 'merged' | 'htmlUrl'>
type NotificationRelease = Pick<DBRelease, 'id' | 'tagName' | 'name' | 'draft' | 'prerelease' | 'htmlUrl'>
type NotificationWorkflowRun = Pick<DBWorkflowRun, 'id' | 'name' | 'workflowName' | 'headBranch' | 'conclusion' | 'htmlUrl'>
type NotificationActor = Pick<User, 'id' | 'login' | 'avatarUrl'>

// Notification with populated relations for API responses
export interface Notification extends DBNotification {
  type: NotificationType
  action: NotificationAction
  // Populated relations
  repository: NotificationRepository | null
  issue: NotificationIssue | null
  release: NotificationRelease | null
  workflowRun: NotificationWorkflowRun | null
  actor: NotificationActor | null
}
