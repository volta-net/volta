import type { DBNotification, DBRelease, DBWorkflowRun, NotificationType, NotificationAction } from './db'
import type { Repository } from './repository'
import type { Issue, User } from './issue'

// Partial types for notification relations (only the fields we need)
type NotificationRepository = Pick<Repository, 'id' | 'name' | 'fullName' | 'htmlUrl'>
type NotificationIssue = Pick<Issue, 'id' | 'type' | 'number' | 'title' | 'state' | 'stateReason' | 'draft' | 'merged' | 'htmlUrl'>
type NotificationRelease = Pick<DBRelease, 'id' | 'tagName' | 'name' | 'htmlUrl'>
type NotificationWorkflowRun = Pick<DBWorkflowRun, 'id' | 'name' | 'workflowName' | 'conclusion' | 'htmlUrl'>
type NotificationActor = Pick<User, 'id' | 'login' | 'avatarUrl'>

// Notification with populated relations for API responses
export interface Notification extends Omit<DBNotification, 'read'> {
  type: NotificationType
  action: NotificationAction
  read: boolean
  // Populated relations
  repository: NotificationRepository | null
  issue: NotificationIssue | null
  release: NotificationRelease | null
  workflowRun: NotificationWorkflowRun | null
  actor: NotificationActor | null
}
