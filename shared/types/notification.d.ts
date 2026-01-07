import type { DBNotification, DBRepository, DBIssue, DBRelease, DBWorkflowRun, DBUser, Serialized } from './db'

// Notification with populated relations for API responses
export interface Notification extends Serialized<DBNotification> {
  repository: Serialized<DBRepository> | null
  issue: Serialized<DBIssue> | null
  release: Serialized<DBRelease> | null
  workflowRun: Serialized<DBWorkflowRun> | null
  actor: Serialized<DBUser> | null
}
