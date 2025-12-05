import { eq, and } from 'drizzle-orm'
import { db, schema } from 'hub:db'
import type { NotificationType } from '../db/schema'

// In development, allow self-notifications for testing
const isDev = import.meta.dev
function shouldSkipSelfNotification(actorId: number, recipientId: number): boolean {
  if (isDev) return false // Allow self-notifications in dev
  return actorId === recipientId
}

interface NotificationData {
  userId: number
  type: NotificationType
  body?: string
  repositoryId?: number
  issueId?: number
  actor?: { id: number, login: string, avatar_url?: string }
}

export async function createNotification(data: NotificationData) {
  try {
    // Ensure actor exists as shadow user
    if (data.actor) {
      await ensureUser(data.actor)
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
      body: data.body,
      repositoryId: data.repositoryId,
      issueId: data.issueId,
      actorId: data.actor?.id
    })
  } catch (error) {
    // Foreign key constraint failure is expected for users not in our system
    console.debug('[notifications] Skipped notification for user:', data.userId, error)
  }
}

// Get subscribers from our database with their preferences
async function getSubscribers(repositoryId: number, notificationType: 'issues' | 'pullRequests' | 'mentions' | 'activity') {
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

// ============================================================================
// Issue Notifications
// ============================================================================

export async function notifyIssueOpened(
  issue: any,
  repository: any,
  actor: any,
  _installationId?: number
) {
  // Get subscribers who want issue notifications from our database
  const subscribers = await getSubscribers(repository.id, 'issues')

  for (const subscriber of subscribers) {
    // Don't notify the actor (person who opened the issue) - except in dev
    if (shouldSkipSelfNotification(actor.id, subscriber.userId)) continue

    await createNotification({
      userId: subscriber.userId,
      type: 'issue_opened',
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
    type: 'issue_assigned',
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
  // Don't notify if no author or closed by author - except in dev
  if (!issue.user) return
  if (shouldSkipSelfNotification(actor.id, issue.user.id)) return

  await createNotification({
    userId: issue.user.id,
    type: 'issue_closed',
    repositoryId: repository.id,
    issueId: issue.id,
    actor
  })
}

export async function notifyIssueReopened(
  issue: any,
  repository: any,
  actor: any
) {
  // Don't notify if no author or reopened by author - except in dev
  if (!issue.user) return
  if (shouldSkipSelfNotification(actor.id, issue.user.id)) return

  await createNotification({
    userId: issue.user.id,
    type: 'issue_reopened',
    repositoryId: repository.id,
    issueId: issue.id,
    actor
  })
}

export async function notifyIssueComment(
  issue: any,
  comment: any,
  repository: any,
  actor: any
) {
  // Notify issue author if they're not the commenter - except in dev
  if (issue.user && !shouldSkipSelfNotification(actor.id, issue.user.id)) {
    await createNotification({
      userId: issue.user.id,
      type: 'issue_comment',
      body: truncate(comment.body, 200),
      repositoryId: repository.id,
      issueId: issue.id,
      actor
    })
  }

  // Notify assignees (except issue author already notified above)
  const notifiedIds = new Set([issue.user?.id])
  for (const assignee of issue.assignees || []) {
    if (!notifiedIds.has(assignee.id) && !shouldSkipSelfNotification(actor.id, assignee.id)) {
      notifiedIds.add(assignee.id)
      await createNotification({
        userId: assignee.id,
        type: 'issue_comment',
        body: truncate(comment.body, 200),
        repositoryId: repository.id,
        issueId: issue.id,
        actor
      })
    }
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
  // Get subscribers who want PR notifications from our database
  const subscribers = await getSubscribers(repository.id, 'pullRequests')

  for (const subscriber of subscribers) {
    // Don't notify the actor (person who opened the PR) - except in dev
    if (shouldSkipSelfNotification(actor.id, subscriber.userId)) continue

    await createNotification({
      userId: subscriber.userId,
      type: 'pr_opened',
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
  // Don't notify if no author or reopened by author - except in dev
  if (!pullRequest.user) return
  if (shouldSkipSelfNotification(actor.id, pullRequest.user.id)) return

  await createNotification({
    userId: pullRequest.user.id,
    type: 'pr_reopened',
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
    type: 'pr_review_requested',
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
  // Notify PR author if they're not the reviewer - except in dev
  if (pullRequest.user && !shouldSkipSelfNotification(actor.id, pullRequest.user.id)) {
    await createNotification({
      userId: pullRequest.user.id,
      type: 'pr_review_submitted',
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
  // Notify PR author if they're not the commenter - except in dev
  if (pullRequest.user && !shouldSkipSelfNotification(actor.id, pullRequest.user.id)) {
    await createNotification({
      userId: pullRequest.user.id,
      type: 'pr_comment',
      body: truncate(comment.body, 200),
      repositoryId: repository.id,
      issueId: pullRequest.id,
      actor
    })
  }

  // Notify assignees (except PR author already notified above)
  const notifiedIds = new Set([pullRequest.user?.id])
  for (const assignee of pullRequest.assignees || []) {
    if (!notifiedIds.has(assignee.id) && !shouldSkipSelfNotification(actor.id, assignee.id)) {
      notifiedIds.add(assignee.id)
      await createNotification({
        userId: assignee.id,
        type: 'pr_comment',
        body: truncate(comment.body, 200),
        repositoryId: repository.id,
        issueId: pullRequest.id,
        actor
      })
    }
  }
}

export async function notifyPRMerged(
  pullRequest: any,
  repository: any,
  actor: any
) {
  // Notify PR author if they didn't merge it themselves - except in dev
  if (pullRequest.user && !shouldSkipSelfNotification(actor.id, pullRequest.user.id)) {
    await createNotification({
      userId: pullRequest.user.id,
      type: 'pr_merged',
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
  // Don't notify if merged (separate notification) or no author or closed by author - except in dev
  if (pullRequest.merged) return
  if (!pullRequest.user) return
  if (shouldSkipSelfNotification(actor.id, pullRequest.user.id)) return

  await createNotification({
    userId: pullRequest.user.id,
    type: 'pr_closed',
    repositoryId: repository.id,
    issueId: pullRequest.id,
    actor
  })
}

// ============================================================================
// Helpers
// ============================================================================

function truncate(text: string | null | undefined, length: number): string | undefined {
  if (!text) return undefined
  if (text.length <= length) return text
  return text.slice(0, length - 3) + '...'
}
