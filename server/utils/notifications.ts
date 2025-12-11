import { eq, and, inArray } from 'drizzle-orm'
import { db, schema } from 'hub:db'
import type { NotificationType, NotificationAction } from '../db/schema'

// In development, allow self-notifications for testing
function shouldSkipSelfNotification(actorId: number, recipientId: number): boolean {
  if (import.meta.dev) return false // Allow self-notifications in dev
  return actorId === recipientId
}

interface NotificationData {
  userId: number
  type: NotificationType
  action: NotificationAction
  body?: string
  repositoryId?: number
  issueId?: number
  releaseId?: number
  workflowRunId?: number
  actor?: { id: number, login: string, avatar_url?: string }
}

export async function createNotification(data: NotificationData) {
  try {
    // Ensure actor exists as shadow user
    if (data.actor) {
      await ensureUser(data.actor)
    }

    // Only notify users who have actually logged in (not shadow users)
    const [user] = await db
      .select({ registered: schema.users.registered })
      .from(schema.users)
      .where(eq(schema.users.id, data.userId))

    if (!user || !user.registered) {
      console.debug('[notifications] Skipping notification for non-registered user:', data.userId)
      return
    }

    // Check if notification already exists for this user + issue
    // If so, update it instead of creating a new one
    if (data.issueId) {
      const [existing] = await db
        .select()
        .from(schema.notifications)
        .where(and(
          eq(schema.notifications.userId, data.userId),
          eq(schema.notifications.issueId, data.issueId)
        ))

      if (existing) {
        await db.update(schema.notifications).set({
          type: data.type,
          action: data.action,
          body: data.body,
          actorId: data.actor?.id,
          read: false, // Mark as unread
          readAt: null,
          createdAt: new Date() // Update timestamp to show as new
        }).where(eq(schema.notifications.id, existing.id))
        return
      }
    }

    // Create new notification
    await db.insert(schema.notifications).values({
      userId: data.userId,
      type: data.type,
      action: data.action,
      body: data.body,
      repositoryId: data.repositoryId,
      issueId: data.issueId,
      releaseId: data.releaseId,
      workflowRunId: data.workflowRunId,
      actorId: data.actor?.id
    })
  } catch (error) {
    // Foreign key constraint failure is expected for users not in our system
    console.debug('[notifications] Skipped notification for user:', data.userId, error)
  }
}

// ============================================================================
// @Mentions Parsing
// ============================================================================

// Extract @usernames from text (GitHub-style mentions)
function findMentionedUsernames(text: string | null | undefined): string[] {
  if (!text) return []

  // Match @username patterns (GitHub usernames: alphanumeric and hyphens, 1-39 chars)
  const mentionRegex = /@([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?)/g
  const matches = text.matchAll(mentionRegex)
  const usernames = new Set<string>()

  for (const match of matches) {
    if (match[1]) {
      usernames.add(match[1].toLowerCase())
    }
  }

  return Array.from(usernames)
}

// Get user IDs for mentioned usernames (only returns users that exist in our DB)
async function getMentionedUserIds(text: string | null | undefined): Promise<number[]> {
  const usernames = findMentionedUsernames(text)
  if (usernames.length === 0) return []

  try {
    const users = await db
      .select({ id: schema.users.id, login: schema.users.login })
      .from(schema.users)
      .where(inArray(schema.users.login, usernames))

    return users.map(u => u.id)
  } catch (error) {
    console.error('[notifications] Failed to get mentioned users:', error)
    return []
  }
}

// ============================================================================
// Subscription Helpers
// ============================================================================

// Get subscribers from our database with their preferences
async function getSubscribers(repositoryId: number, notificationType: 'issues' | 'pullRequests' | 'releases' | 'ci' | 'mentions' | 'activity') {
  try {
    const subscriptions = await db
      .select()
      .from(schema.repositorySubscriptions)
      .where(eq(schema.repositorySubscriptions.repositoryId, repositoryId))

    return subscriptions.filter(sub => sub[notificationType])
  } catch (error) {
    console.error('[notifications] Failed to get subscribers:', error)
    return []
  }
}

// Check if a user is subscribed to an issue
async function isUserSubscribedToIssue(userId: number, issueId: number): Promise<boolean> {
  try {
    const [subscription] = await db
      .select()
      .from(schema.issueSubscriptions)
      .where(and(
        eq(schema.issueSubscriptions.userId, userId),
        eq(schema.issueSubscriptions.issueId, issueId)
      ))

    return !!subscription
  } catch (error) {
    console.error('[notifications] Failed to check issue subscription:', error)
    return false
  }
}

// Get activity subscribers who are also subscribed to the specific issue
async function getActivitySubscribersForIssue(repositoryId: number, issueId: number): Promise<number[]> {
  try {
    // Get users who have activity enabled for this repository
    const activitySubscribers = await getSubscribers(repositoryId, 'activity')

    // Filter to only those who are subscribed to this specific issue
    const subscribedUserIds: number[] = []
    for (const sub of activitySubscribers) {
      if (await isUserSubscribedToIssue(sub.userId, issueId)) {
        subscribedUserIds.push(sub.userId)
      }
    }

    return subscribedUserIds
  } catch (error) {
    console.error('[notifications] Failed to get activity subscribers for issue:', error)
    return []
  }
}

// ============================================================================
// Issue Notifications
// ============================================================================

export async function notifyIssueOpened(
  issue: any,
  repository: any,
  actor: any,
  _installationId?: number
) {
  const notifiedIds = new Set<number>()

  // Notify subscribers who want issue notifications
  const subscribers = await getSubscribers(repository.id, 'issues')
  for (const subscriber of subscribers) {
    if (shouldSkipSelfNotification(actor.id, subscriber.userId)) continue
    notifiedIds.add(subscriber.userId)

    await createNotification({
      userId: subscriber.userId,
      type: 'issue',
      action: 'opened',
      repositoryId: repository.id,
      issueId: issue.id,
      actor
    })
  }

  // Notify mentioned users (who have mentions enabled)
  const mentionedUserIds = await getMentionedUserIds(issue.body)
  const mentionSubscribers = await getSubscribers(repository.id, 'mentions')
  const mentionSubscriberIds = new Set(mentionSubscribers.map(s => s.userId))

  for (const userId of mentionedUserIds) {
    if (notifiedIds.has(userId)) continue
    if (shouldSkipSelfNotification(actor.id, userId)) continue
    if (!mentionSubscriberIds.has(userId)) continue
    notifiedIds.add(userId)

    await createNotification({
      userId,
      type: 'issue',
      action: 'mentioned',
      repositoryId: repository.id,
      issueId: issue.id,
      actor
    })
  }
}

export async function notifyIssueAssigned(
  issue: any,
  repository: any,
  assignee: any,
  actor: any
) {
  // Don't notify if user assigned themselves - except in dev
  if (shouldSkipSelfNotification(actor.id, assignee.id)) return

  await createNotification({
    userId: assignee.id,
    type: 'issue',
    action: 'assigned',
    repositoryId: repository.id,
    issueId: issue.id,
    actor
  })
}

export async function notifyIssueClosed(
  issue: any,
  repository: any,
  actor: any
) {
  const notifiedIds = new Set<number>()

  // Notify issue author
  if (issue.user && !shouldSkipSelfNotification(actor.id, issue.user.id)) {
    notifiedIds.add(issue.user.id)
    await createNotification({
      userId: issue.user.id,
      type: 'issue',
      action: 'closed',
      repositoryId: repository.id,
      issueId: issue.id,
      actor
    })
  }

  // Notify assignees
  for (const assignee of issue.assignees || []) {
    if (notifiedIds.has(assignee.id)) continue
    if (shouldSkipSelfNotification(actor.id, assignee.id)) continue
    notifiedIds.add(assignee.id)

    await createNotification({
      userId: assignee.id,
      type: 'issue',
      action: 'closed',
      repositoryId: repository.id,
      issueId: issue.id,
      actor
    })
  }

  // Notify activity subscribers who are subscribed to this issue
  const activitySubscribers = await getActivitySubscribersForIssue(repository.id, issue.id)
  for (const userId of activitySubscribers) {
    if (notifiedIds.has(userId)) continue
    if (shouldSkipSelfNotification(actor.id, userId)) continue
    notifiedIds.add(userId)

    await createNotification({
      userId,
      type: 'issue',
      action: 'closed',
      repositoryId: repository.id,
      issueId: issue.id,
      actor
    })
  }
}

export async function notifyIssueReopened(
  issue: any,
  repository: any,
  actor: any
) {
  const notifiedIds = new Set<number>()

  // Notify issue author
  if (issue.user && !shouldSkipSelfNotification(actor.id, issue.user.id)) {
    notifiedIds.add(issue.user.id)
    await createNotification({
      userId: issue.user.id,
      type: 'issue',
      action: 'reopened',
      repositoryId: repository.id,
      issueId: issue.id,
      actor
    })
  }

  // Notify assignees
  for (const assignee of issue.assignees || []) {
    if (notifiedIds.has(assignee.id)) continue
    if (shouldSkipSelfNotification(actor.id, assignee.id)) continue
    notifiedIds.add(assignee.id)

    await createNotification({
      userId: assignee.id,
      type: 'issue',
      action: 'reopened',
      repositoryId: repository.id,
      issueId: issue.id,
      actor
    })
  }

  // Notify activity subscribers who are subscribed to this issue
  const activitySubscribers = await getActivitySubscribersForIssue(repository.id, issue.id)
  for (const userId of activitySubscribers) {
    if (notifiedIds.has(userId)) continue
    if (shouldSkipSelfNotification(actor.id, userId)) continue
    notifiedIds.add(userId)

    await createNotification({
      userId,
      type: 'issue',
      action: 'reopened',
      repositoryId: repository.id,
      issueId: issue.id,
      actor
    })
  }
}

export async function notifyIssueComment(
  issue: any,
  comment: any,
  repository: any,
  actor: any
) {
  const notifiedIds = new Set<number>()

  // Notify issue author
  if (issue.user && !shouldSkipSelfNotification(actor.id, issue.user.id)) {
    notifiedIds.add(issue.user.id)
    await createNotification({
      userId: issue.user.id,
      type: 'issue',
      action: 'comment',
      body: truncate(comment.body, 200),
      repositoryId: repository.id,
      issueId: issue.id,
      actor
    })
  }

  // Notify assignees
  for (const assignee of issue.assignees || []) {
    if (notifiedIds.has(assignee.id)) continue
    if (shouldSkipSelfNotification(actor.id, assignee.id)) continue
    notifiedIds.add(assignee.id)

    await createNotification({
      userId: assignee.id,
      type: 'issue',
      action: 'comment',
      body: truncate(comment.body, 200),
      repositoryId: repository.id,
      issueId: issue.id,
      actor
    })
  }

  // Notify mentioned users (who have mentions enabled)
  const mentionedUserIds = await getMentionedUserIds(comment.body)
  const mentionSubscribers = await getSubscribers(repository.id, 'mentions')
  const mentionSubscriberIds = new Set(mentionSubscribers.map(s => s.userId))

  for (const userId of mentionedUserIds) {
    if (notifiedIds.has(userId)) continue
    if (shouldSkipSelfNotification(actor.id, userId)) continue
    if (!mentionSubscriberIds.has(userId)) continue
    notifiedIds.add(userId)

    await createNotification({
      userId,
      type: 'issue',
      action: 'mentioned',
      body: truncate(comment.body, 200),
      repositoryId: repository.id,
      issueId: issue.id,
      actor
    })
  }

  // Notify activity subscribers who are subscribed to this issue
  const activitySubscribers = await getActivitySubscribersForIssue(repository.id, issue.id)
  for (const userId of activitySubscribers) {
    if (notifiedIds.has(userId)) continue
    if (shouldSkipSelfNotification(actor.id, userId)) continue
    notifiedIds.add(userId)

    await createNotification({
      userId,
      type: 'issue',
      action: 'comment',
      body: truncate(comment.body, 200),
      repositoryId: repository.id,
      issueId: issue.id,
      actor
    })
  }
}

// ============================================================================
// Pull Request Notifications
// ============================================================================

export async function notifyPROpened(
  pullRequest: any,
  repository: any,
  actor: any
) {
  const notifiedIds = new Set<number>()

  // Notify subscribers who want PR notifications
  const subscribers = await getSubscribers(repository.id, 'pullRequests')
  for (const subscriber of subscribers) {
    if (shouldSkipSelfNotification(actor.id, subscriber.userId)) continue
    notifiedIds.add(subscriber.userId)

    await createNotification({
      userId: subscriber.userId,
      type: 'pull_request',
      action: 'opened',
      repositoryId: repository.id,
      issueId: pullRequest.id,
      actor
    })
  }

  // Notify mentioned users (who have mentions enabled)
  const mentionedUserIds = await getMentionedUserIds(pullRequest.body)
  const mentionSubscribers = await getSubscribers(repository.id, 'mentions')
  const mentionSubscriberIds = new Set(mentionSubscribers.map(s => s.userId))

  for (const userId of mentionedUserIds) {
    if (notifiedIds.has(userId)) continue
    if (shouldSkipSelfNotification(actor.id, userId)) continue
    if (!mentionSubscriberIds.has(userId)) continue
    notifiedIds.add(userId)

    await createNotification({
      userId,
      type: 'pull_request',
      action: 'mentioned',
      repositoryId: repository.id,
      issueId: pullRequest.id,
      actor
    })
  }
}

export async function notifyPRReopened(
  pullRequest: any,
  repository: any,
  actor: any
) {
  const notifiedIds = new Set<number>()

  // Notify PR author
  if (pullRequest.user && !shouldSkipSelfNotification(actor.id, pullRequest.user.id)) {
    notifiedIds.add(pullRequest.user.id)
    await createNotification({
      userId: pullRequest.user.id,
      type: 'pull_request',
      action: 'reopened',
      repositoryId: repository.id,
      issueId: pullRequest.id,
      actor
    })
  }

  // Notify assignees
  for (const assignee of pullRequest.assignees || []) {
    if (notifiedIds.has(assignee.id)) continue
    if (shouldSkipSelfNotification(actor.id, assignee.id)) continue
    notifiedIds.add(assignee.id)

    await createNotification({
      userId: assignee.id,
      type: 'pull_request',
      action: 'reopened',
      repositoryId: repository.id,
      issueId: pullRequest.id,
      actor
    })
  }

  // Notify activity subscribers who are subscribed to this PR
  const activitySubscribers = await getActivitySubscribersForIssue(repository.id, pullRequest.id)
  for (const userId of activitySubscribers) {
    if (notifiedIds.has(userId)) continue
    if (shouldSkipSelfNotification(actor.id, userId)) continue
    notifiedIds.add(userId)

    await createNotification({
      userId,
      type: 'pull_request',
      action: 'reopened',
      repositoryId: repository.id,
      issueId: pullRequest.id,
      actor
    })
  }
}

export async function notifyPRAssigned(
  pullRequest: any,
  repository: any,
  assignee: any,
  actor: any
) {
  // Don't notify if user assigned themselves - except in dev
  if (shouldSkipSelfNotification(actor.id, assignee.id)) return

  await createNotification({
    userId: assignee.id,
    type: 'pull_request',
    action: 'assigned',
    repositoryId: repository.id,
    issueId: pullRequest.id,
    actor
  })
}

export async function notifyPRReviewRequested(
  pullRequest: any,
  repository: any,
  reviewer: any,
  actor: any
) {
  // Don't notify if user requested review from themselves - except in dev
  if (shouldSkipSelfNotification(actor.id, reviewer.id)) return

  await createNotification({
    userId: reviewer.id,
    type: 'pull_request',
    action: 'review_requested',
    repositoryId: repository.id,
    issueId: pullRequest.id,
    actor
  })
}

export async function notifyPRReadyForReview(
  pullRequest: any,
  repository: any,
  actor: any
) {
  // Notify requested reviewers that the PR is ready
  const requestedReviewers = pullRequest.requested_reviewers || []

  for (const reviewer of requestedReviewers) {
    if (shouldSkipSelfNotification(actor.id, reviewer.id)) continue

    await createNotification({
      userId: reviewer.id,
      type: 'pull_request',
      action: 'ready_for_review',
      repositoryId: repository.id,
      issueId: pullRequest.id,
      actor
    })
  }
}

export async function notifyPRReviewDismissed(
  pullRequest: any,
  review: any,
  repository: any,
  actor: any
) {
  // Notify the reviewer whose review was dismissed
  if (!review.user) return
  if (shouldSkipSelfNotification(actor.id, review.user.id)) return

  await createNotification({
    userId: review.user.id,
    type: 'pull_request',
    action: 'review_dismissed',
    repositoryId: repository.id,
    issueId: pullRequest.id,
    actor
  })
}

export async function notifyPRReviewSubmitted(
  pullRequest: any,
  review: any,
  repository: any,
  actor: any
) {
  const notifiedIds = new Set<number>()

  // Notify PR author
  if (pullRequest.user && !shouldSkipSelfNotification(actor.id, pullRequest.user.id)) {
    notifiedIds.add(pullRequest.user.id)
    await createNotification({
      userId: pullRequest.user.id,
      type: 'pull_request',
      action: 'review_submitted',
      body: truncate(review.body, 200),
      repositoryId: repository.id,
      issueId: pullRequest.id,
      actor
    })
  }

  // Notify mentioned users in review body (who have mentions enabled)
  const mentionedUserIds = await getMentionedUserIds(review.body)
  const mentionSubscribers = await getSubscribers(repository.id, 'mentions')
  const mentionSubscriberIds = new Set(mentionSubscribers.map(s => s.userId))

  for (const userId of mentionedUserIds) {
    if (notifiedIds.has(userId)) continue
    if (shouldSkipSelfNotification(actor.id, userId)) continue
    if (!mentionSubscriberIds.has(userId)) continue
    notifiedIds.add(userId)

    await createNotification({
      userId,
      type: 'pull_request',
      action: 'mentioned',
      body: truncate(review.body, 200),
      repositoryId: repository.id,
      issueId: pullRequest.id,
      actor
    })
  }

  // Notify activity subscribers who are subscribed to this PR
  const activitySubscribers = await getActivitySubscribersForIssue(repository.id, pullRequest.id)
  for (const userId of activitySubscribers) {
    if (notifiedIds.has(userId)) continue
    if (shouldSkipSelfNotification(actor.id, userId)) continue
    notifiedIds.add(userId)

    await createNotification({
      userId,
      type: 'pull_request',
      action: 'review_submitted',
      body: truncate(review.body, 200),
      repositoryId: repository.id,
      issueId: pullRequest.id,
      actor
    })
  }
}

export async function notifyPRComment(
  pullRequest: any,
  comment: any,
  repository: any,
  actor: any
) {
  const notifiedIds = new Set<number>()

  // Notify PR author
  if (pullRequest.user && !shouldSkipSelfNotification(actor.id, pullRequest.user.id)) {
    notifiedIds.add(pullRequest.user.id)
    await createNotification({
      userId: pullRequest.user.id,
      type: 'pull_request',
      action: 'comment',
      body: truncate(comment.body, 200),
      repositoryId: repository.id,
      issueId: pullRequest.id,
      actor
    })
  }

  // Notify assignees
  for (const assignee of pullRequest.assignees || []) {
    if (notifiedIds.has(assignee.id)) continue
    if (shouldSkipSelfNotification(actor.id, assignee.id)) continue
    notifiedIds.add(assignee.id)

    await createNotification({
      userId: assignee.id,
      type: 'pull_request',
      action: 'comment',
      body: truncate(comment.body, 200),
      repositoryId: repository.id,
      issueId: pullRequest.id,
      actor
    })
  }

  // Notify mentioned users (who have mentions enabled)
  const mentionedUserIds = await getMentionedUserIds(comment.body)
  const mentionSubscribers = await getSubscribers(repository.id, 'mentions')
  const mentionSubscriberIds = new Set(mentionSubscribers.map(s => s.userId))

  for (const userId of mentionedUserIds) {
    if (notifiedIds.has(userId)) continue
    if (shouldSkipSelfNotification(actor.id, userId)) continue
    if (!mentionSubscriberIds.has(userId)) continue
    notifiedIds.add(userId)

    await createNotification({
      userId,
      type: 'pull_request',
      action: 'mentioned',
      body: truncate(comment.body, 200),
      repositoryId: repository.id,
      issueId: pullRequest.id,
      actor
    })
  }

  // Notify activity subscribers who are subscribed to this PR
  const activitySubscribers = await getActivitySubscribersForIssue(repository.id, pullRequest.id)
  for (const userId of activitySubscribers) {
    if (notifiedIds.has(userId)) continue
    if (shouldSkipSelfNotification(actor.id, userId)) continue
    notifiedIds.add(userId)

    await createNotification({
      userId,
      type: 'pull_request',
      action: 'comment',
      body: truncate(comment.body, 200),
      repositoryId: repository.id,
      issueId: pullRequest.id,
      actor
    })
  }
}

export async function notifyPRMerged(
  pullRequest: any,
  repository: any,
  actor: any
) {
  const notifiedIds = new Set<number>()

  // Notify PR author
  if (pullRequest.user && !shouldSkipSelfNotification(actor.id, pullRequest.user.id)) {
    notifiedIds.add(pullRequest.user.id)
    await createNotification({
      userId: pullRequest.user.id,
      type: 'pull_request',
      action: 'merged',
      repositoryId: repository.id,
      issueId: pullRequest.id,
      actor
    })
  }

  // Notify assignees
  for (const assignee of pullRequest.assignees || []) {
    if (notifiedIds.has(assignee.id)) continue
    if (shouldSkipSelfNotification(actor.id, assignee.id)) continue
    notifiedIds.add(assignee.id)

    await createNotification({
      userId: assignee.id,
      type: 'pull_request',
      action: 'merged',
      repositoryId: repository.id,
      issueId: pullRequest.id,
      actor
    })
  }

  // Notify activity subscribers who are subscribed to this PR
  const activitySubscribers = await getActivitySubscribersForIssue(repository.id, pullRequest.id)
  for (const userId of activitySubscribers) {
    if (notifiedIds.has(userId)) continue
    if (shouldSkipSelfNotification(actor.id, userId)) continue
    notifiedIds.add(userId)

    await createNotification({
      userId,
      type: 'pull_request',
      action: 'merged',
      repositoryId: repository.id,
      issueId: pullRequest.id,
      actor
    })
  }
}

export async function notifyPRClosed(
  pullRequest: any,
  repository: any,
  actor: any
) {
  // Don't notify if merged (separate notification)
  if (pullRequest.merged) return

  const notifiedIds = new Set<number>()

  // Notify PR author
  if (pullRequest.user && !shouldSkipSelfNotification(actor.id, pullRequest.user.id)) {
    notifiedIds.add(pullRequest.user.id)
    await createNotification({
      userId: pullRequest.user.id,
      type: 'pull_request',
      action: 'closed',
      repositoryId: repository.id,
      issueId: pullRequest.id,
      actor
    })
  }

  // Notify assignees
  for (const assignee of pullRequest.assignees || []) {
    if (notifiedIds.has(assignee.id)) continue
    if (shouldSkipSelfNotification(actor.id, assignee.id)) continue
    notifiedIds.add(assignee.id)

    await createNotification({
      userId: assignee.id,
      type: 'pull_request',
      action: 'closed',
      repositoryId: repository.id,
      issueId: pullRequest.id,
      actor
    })
  }

  // Notify activity subscribers who are subscribed to this PR
  const activitySubscribers = await getActivitySubscribersForIssue(repository.id, pullRequest.id)
  for (const userId of activitySubscribers) {
    if (notifiedIds.has(userId)) continue
    if (shouldSkipSelfNotification(actor.id, userId)) continue
    notifiedIds.add(userId)

    await createNotification({
      userId,
      type: 'pull_request',
      action: 'closed',
      repositoryId: repository.id,
      issueId: pullRequest.id,
      actor
    })
  }
}

// ============================================================================
// Release Notifications
// ============================================================================

export async function notifyReleasePublished(
  release: any,
  repository: any,
  actor: any
) {
  // Notify subscribers who want release notifications
  const subscribers = await getSubscribers(repository.id, 'releases')
  for (const subscriber of subscribers) {
    if (shouldSkipSelfNotification(actor.id, subscriber.userId)) continue

    await createNotification({
      userId: subscriber.userId,
      type: 'release',
      action: 'published',
      body: release.name || release.tag_name,
      repositoryId: repository.id,
      releaseId: release.id,
      actor
    })
  }
}

// ============================================================================
// Workflow Run Notifications
// ============================================================================

export async function notifyWorkflowFailed(
  workflowRun: any,
  repository: any,
  actor: any
) {
  // Notify subscribers who want CI failure notifications
  const subscribers = await getSubscribers(repository.id, 'ci')
  for (const subscriber of subscribers) {
    // Don't skip self-notification for CI - you want to know if your own build failed
    await createNotification({
      userId: subscriber.userId,
      type: 'workflow_run',
      action: 'failed',
      body: workflowRun.name || workflowRun.display_title || workflowRun.workflow?.name,
      repositoryId: repository.id,
      workflowRunId: workflowRun.id,
      actor
    })
  }
}

export async function notifyWorkflowSuccess(
  _workflowRun: any,
  _repository: any,
  _actor: any
) {
  // Only notify after a previous failure (recovery notification)
  // This would require tracking previous state - for now, skip success notifications
  // as they'd be too noisy. Users only get notified on failures.
}

// ============================================================================
// Helpers
// ============================================================================

function truncate(text: string | null | undefined, length: number): string | undefined {
  if (!text) return undefined
  if (text.length <= length) return text
  return text.slice(0, length - 3) + '...'
}
