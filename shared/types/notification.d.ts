import type { NotificationType, NotificationAction } from '../../server/db/schema'

export interface Notification {
  id: number
  userId: number
  type: NotificationType
  action: NotificationAction
  body: string | null
  repositoryId: number | null
  issueId: number | null
  releaseId: number | null
  workflowRunId: number | null
  actorId: number | null
  read: boolean
  readAt: Date | null
  createdAt: Date
  // Populated relations
  repository: {
    id: number
    name: string
    fullName: string
    htmlUrl: string | null
  } | null
  issue: {
    id: number
    type: 'issue' | 'pull_request'
    number: number
    title: string
    state: string
    stateReason: string | null
    draft: boolean | null
    merged: boolean | null
    htmlUrl: string | null
  } | null
  release: {
    id: number
    tagName: string
    name: string | null
    htmlUrl: string | null
  } | null
  workflowRun: {
    id: number
    name: string | null
    workflowName: string | null
    conclusion: string | null
    htmlUrl: string | null
  } | null
  actor: {
    id: number
    login: string
    avatarUrl: string | null
  } | null
}
