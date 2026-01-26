import { eq, and, inArray } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import type { NotificationType, NotificationAction } from '@nuxthub/db/schema'
import type {
  GitHubUser,
  GitHubRepository,
  GitHubIssue,
  GitHubPullRequest,
  GitHubComment,
  GitHubReview,
  GitHubRelease,
  GitHubWorkflowRun
} from '../types/github'
import { ensureUser, getDbUserId, getDbRepositoryId } from './users'
import { getDbIssueId } from './sync'

// In development, allow self-notifications for testing
function shouldSkipSelfNotification(actorDbId: number, recipientDbId: number): boolean {
  if (import.meta.dev) return false // Allow self-notifications in dev
  return actorDbId === recipientDbId
}

// Check if a user is a bot (e.g., dependabot, renovate-bot, etc.)
function isBot(user: GitHubUser): boolean {
  return user.type === 'Bot' || user.login.endsWith('[bot]')
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
  actorId?: number
}

export async function createNotification(data: NotificationData) {
  try {
    // Only notify users who have actually logged in (not shadow users)
    const [user] = await db
      .select({ registered: schema.users.registered })
      .from(schema.users)
      .where(eq(schema.users.id, data.userId))

    if (!user || !user.registered) {
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
          actorId: data.actorId,
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
      actorId: data.actorId
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

// Get internal user IDs for mentioned usernames (only returns users that exist in our DB)
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
  issue: GitHubIssue,
  repository: GitHubRepository,
  actor: GitHubUser,
  _installationId?: number
) {
  // Get internal repository ID
  const dbRepoId = await getDbRepositoryId(repository.id)
  if (!dbRepoId) {
    console.warn(`[notifications] Repository ${repository.full_name} not found in DB, skipping opened notification`)
    return
  }

  // Look up the database issue ID
  const dbIssueId = await getDbIssueId(dbRepoId, issue.number)
  if (!dbIssueId) {
    console.warn(`[notifications] Issue #${issue.number} not found in DB, skipping opened notification`)
    return
  }

  // Get actor's internal ID
  const actorDbId = await ensureUser({
    id: actor.id,
    login: actor.login,
    avatar_url: actor.avatar_url
  })
  if (!actorDbId) return

  const notifiedIds = new Set<number>()

  // Notify subscribers who want issue notifications
  const subscribers = await getSubscribers(dbRepoId, 'issues')
  for (const subscriber of subscribers) {
    if (shouldSkipSelfNotification(actorDbId, subscriber.userId)) continue
    notifiedIds.add(subscriber.userId)

    await createNotification({
      userId: subscriber.userId,
      type: 'issue',
      action: 'opened',
      repositoryId: dbRepoId,
      issueId: dbIssueId,
      actorId: actorDbId
    })
  }

  // Notify mentioned users (who have mentions enabled)
  const mentionedUserIds = await getMentionedUserIds(issue.body)
  const mentionSubscribers = await getSubscribers(dbRepoId, 'mentions')
  const mentionSubscriberIds = new Set(mentionSubscribers.map(s => s.userId))

  for (const userId of mentionedUserIds) {
    if (notifiedIds.has(userId)) continue
    if (shouldSkipSelfNotification(actorDbId, userId)) continue
    if (!mentionSubscriberIds.has(userId)) continue
    notifiedIds.add(userId)

    await createNotification({
      userId,
      type: 'issue',
      action: 'mentioned',
      repositoryId: dbRepoId,
      issueId: dbIssueId,
      actorId: actorDbId
    })
  }
}

export async function notifyIssueAssigned(
  issue: GitHubIssue,
  repository: GitHubRepository,
  assignee: GitHubUser,
  actor: GitHubUser
) {
  // Get internal repository ID
  const dbRepoId = await getDbRepositoryId(repository.id)
  if (!dbRepoId) return

  // Get internal user IDs
  const actorDbId = await ensureUser({
    id: actor.id,
    login: actor.login,
    avatar_url: actor.avatar_url
  })
  if (!actorDbId) return

  const assigneeDbId = await ensureUser({
    id: assignee.id,
    login: assignee.login,
    avatar_url: assignee.avatar_url
  })
  if (!assigneeDbId) return

  // Don't notify if user assigned themselves - except in dev
  if (shouldSkipSelfNotification(actorDbId, assigneeDbId)) return

  // Look up the database issue ID
  const dbIssueId = await getDbIssueId(dbRepoId, issue.number)
  if (!dbIssueId) {
    console.warn(`[notifications] Issue #${issue.number} not found in DB, skipping assigned notification`)
    return
  }

  await createNotification({
    userId: assigneeDbId,
    type: 'issue',
    action: 'assigned',
    repositoryId: dbRepoId,
    issueId: dbIssueId,
    actorId: actorDbId
  })
}

export async function notifyIssueClosed(
  issue: GitHubIssue,
  repository: GitHubRepository,
  actor: GitHubUser
) {
  // Get internal repository ID
  const dbRepoId = await getDbRepositoryId(repository.id)
  if (!dbRepoId) return

  // Look up the database issue ID
  const dbIssueId = await getDbIssueId(dbRepoId, issue.number)
  if (!dbIssueId) {
    console.warn(`[notifications] Issue #${issue.number} not found in DB, skipping closed notification`)
    return
  }

  // Get actor's internal ID
  const actorDbId = await ensureUser({
    id: actor.id,
    login: actor.login,
    avatar_url: actor.avatar_url
  })
  if (!actorDbId) return

  const notifiedIds = new Set<number>()

  // Notify issue author
  if (issue.user) {
    const authorDbId = await getDbUserId(issue.user.id)
    if (authorDbId && !shouldSkipSelfNotification(actorDbId, authorDbId)) {
      notifiedIds.add(authorDbId)
      await createNotification({
        userId: authorDbId,
        type: 'issue',
        action: 'closed',
        repositoryId: dbRepoId,
        issueId: dbIssueId,
        actorId: actorDbId
      })
    }
  }

  // Notify assignees
  for (const assignee of issue.assignees || []) {
    const assigneeDbId = await getDbUserId(assignee.id)
    if (!assigneeDbId) continue
    if (notifiedIds.has(assigneeDbId)) continue
    if (shouldSkipSelfNotification(actorDbId, assigneeDbId)) continue
    notifiedIds.add(assigneeDbId)

    await createNotification({
      userId: assigneeDbId,
      type: 'issue',
      action: 'closed',
      repositoryId: dbRepoId,
      issueId: dbIssueId,
      actorId: actorDbId
    })
  }

  // Notify activity subscribers who are subscribed to this issue
  const activitySubscribers = await getActivitySubscribersForIssue(dbRepoId, dbIssueId)
  for (const userId of activitySubscribers) {
    if (notifiedIds.has(userId)) continue
    if (shouldSkipSelfNotification(actorDbId, userId)) continue
    notifiedIds.add(userId)

    await createNotification({
      userId,
      type: 'issue',
      action: 'closed',
      repositoryId: dbRepoId,
      issueId: dbIssueId,
      actorId: actorDbId
    })
  }
}

export async function notifyIssueReopened(
  issue: GitHubIssue,
  repository: GitHubRepository,
  actor: GitHubUser
) {
  // Get internal repository ID
  const dbRepoId = await getDbRepositoryId(repository.id)
  if (!dbRepoId) return

  // Look up the database issue ID
  const dbIssueId = await getDbIssueId(dbRepoId, issue.number)
  if (!dbIssueId) {
    console.warn(`[notifications] Issue #${issue.number} not found in DB, skipping reopened notification`)
    return
  }

  // Get actor's internal ID
  const actorDbId = await ensureUser({
    id: actor.id,
    login: actor.login,
    avatar_url: actor.avatar_url
  })
  if (!actorDbId) return

  const notifiedIds = new Set<number>()

  // Notify issue author
  if (issue.user) {
    const authorDbId = await getDbUserId(issue.user.id)
    if (authorDbId && !shouldSkipSelfNotification(actorDbId, authorDbId)) {
      notifiedIds.add(authorDbId)
      await createNotification({
        userId: authorDbId,
        type: 'issue',
        action: 'reopened',
        repositoryId: dbRepoId,
        issueId: dbIssueId,
        actorId: actorDbId
      })
    }
  }

  // Notify assignees
  for (const assignee of issue.assignees || []) {
    const assigneeDbId = await getDbUserId(assignee.id)
    if (!assigneeDbId) continue
    if (notifiedIds.has(assigneeDbId)) continue
    if (shouldSkipSelfNotification(actorDbId, assigneeDbId)) continue
    notifiedIds.add(assigneeDbId)

    await createNotification({
      userId: assigneeDbId,
      type: 'issue',
      action: 'reopened',
      repositoryId: dbRepoId,
      issueId: dbIssueId,
      actorId: actorDbId
    })
  }

  // Notify activity subscribers who are subscribed to this issue
  const activitySubscribers = await getActivitySubscribersForIssue(dbRepoId, dbIssueId)
  for (const userId of activitySubscribers) {
    if (notifiedIds.has(userId)) continue
    if (shouldSkipSelfNotification(actorDbId, userId)) continue
    notifiedIds.add(userId)

    await createNotification({
      userId,
      type: 'issue',
      action: 'reopened',
      repositoryId: dbRepoId,
      issueId: dbIssueId,
      actorId: actorDbId
    })
  }
}

export async function notifyIssueComment(
  issue: GitHubIssue,
  comment: GitHubComment,
  repository: GitHubRepository,
  actor: GitHubUser
) {
  // Skip notifications from bots
  if (isBot(actor)) return

  // Get internal repository ID
  const dbRepoId = await getDbRepositoryId(repository.id)
  if (!dbRepoId) return

  // Look up the database issue ID
  const dbIssueId = await getDbIssueId(dbRepoId, issue.number)
  if (!dbIssueId) {
    console.warn(`[notifications] Issue #${issue.number} not found in DB, skipping comment notification`)
    return
  }

  // Get actor's internal ID
  const actorDbId = await ensureUser({
    id: actor.id,
    login: actor.login,
    avatar_url: actor.avatar_url
  })
  if (!actorDbId) return

  const notifiedIds = new Set<number>()

  // Notify issue author
  if (issue.user) {
    const authorDbId = await getDbUserId(issue.user.id)
    if (authorDbId && !shouldSkipSelfNotification(actorDbId, authorDbId)) {
      notifiedIds.add(authorDbId)
      await createNotification({
        userId: authorDbId,
        type: 'issue',
        action: 'comment',
        body: truncate(comment.body, 200),
        repositoryId: dbRepoId,
        issueId: dbIssueId,
        actorId: actorDbId
      })
    }
  }

  // Notify assignees
  for (const assignee of issue.assignees || []) {
    const assigneeDbId = await getDbUserId(assignee.id)
    if (!assigneeDbId) continue
    if (notifiedIds.has(assigneeDbId)) continue
    if (shouldSkipSelfNotification(actorDbId, assigneeDbId)) continue
    notifiedIds.add(assigneeDbId)

    await createNotification({
      userId: assigneeDbId,
      type: 'issue',
      action: 'comment',
      body: truncate(comment.body, 200),
      repositoryId: dbRepoId,
      issueId: dbIssueId,
      actorId: actorDbId
    })
  }

  // Notify mentioned users (who have mentions enabled)
  const mentionedUserIds = await getMentionedUserIds(comment.body)
  const mentionSubscribers = await getSubscribers(dbRepoId, 'mentions')
  const mentionSubscriberIds = new Set(mentionSubscribers.map(s => s.userId))

  for (const userId of mentionedUserIds) {
    if (notifiedIds.has(userId)) continue
    if (shouldSkipSelfNotification(actorDbId, userId)) continue
    if (!mentionSubscriberIds.has(userId)) continue
    notifiedIds.add(userId)

    await createNotification({
      userId,
      type: 'issue',
      action: 'mentioned',
      body: truncate(comment.body, 200),
      repositoryId: dbRepoId,
      issueId: dbIssueId,
      actorId: actorDbId
    })
  }

  // Notify activity subscribers who are subscribed to this issue
  const activitySubscribers = await getActivitySubscribersForIssue(dbRepoId, dbIssueId)
  for (const userId of activitySubscribers) {
    if (notifiedIds.has(userId)) continue
    if (shouldSkipSelfNotification(actorDbId, userId)) continue
    notifiedIds.add(userId)

    await createNotification({
      userId,
      type: 'issue',
      action: 'comment',
      body: truncate(comment.body, 200),
      repositoryId: dbRepoId,
      issueId: dbIssueId,
      actorId: actorDbId
    })
  }
}

// ============================================================================
// Pull Request Notifications
// ============================================================================

export async function notifyPROpened(
  pullRequest: GitHubPullRequest,
  repository: GitHubRepository,
  actor: GitHubUser
) {
  // Get internal repository ID
  const dbRepoId = await getDbRepositoryId(repository.id)
  if (!dbRepoId) return

  // Look up the database issue ID
  const dbIssueId = await getDbIssueId(dbRepoId, pullRequest.number)
  if (!dbIssueId) {
    console.warn(`[notifications] PR #${pullRequest.number} not found in DB, skipping opened notification`)
    return
  }

  // Get actor's internal ID
  const actorDbId = await ensureUser({
    id: actor.id,
    login: actor.login,
    avatar_url: actor.avatar_url
  })
  if (!actorDbId) return

  const notifiedIds = new Set<number>()

  // Notify subscribers who want PR notifications
  const subscribers = await getSubscribers(dbRepoId, 'pullRequests')
  for (const subscriber of subscribers) {
    if (shouldSkipSelfNotification(actorDbId, subscriber.userId)) continue
    notifiedIds.add(subscriber.userId)

    await createNotification({
      userId: subscriber.userId,
      type: 'pull_request',
      action: 'opened',
      repositoryId: dbRepoId,
      issueId: dbIssueId,
      actorId: actorDbId
    })
  }

  // Notify mentioned users (who have mentions enabled)
  const mentionedUserIds = await getMentionedUserIds(pullRequest.body)
  const mentionSubscribers = await getSubscribers(dbRepoId, 'mentions')
  const mentionSubscriberIds = new Set(mentionSubscribers.map(s => s.userId))

  for (const userId of mentionedUserIds) {
    if (notifiedIds.has(userId)) continue
    if (shouldSkipSelfNotification(actorDbId, userId)) continue
    if (!mentionSubscriberIds.has(userId)) continue
    notifiedIds.add(userId)

    await createNotification({
      userId,
      type: 'pull_request',
      action: 'mentioned',
      repositoryId: dbRepoId,
      issueId: dbIssueId,
      actorId: actorDbId
    })
  }
}

export async function notifyPRReopened(
  pullRequest: GitHubPullRequest,
  repository: GitHubRepository,
  actor: GitHubUser
) {
  // Get internal repository ID
  const dbRepoId = await getDbRepositoryId(repository.id)
  if (!dbRepoId) return

  // Look up the database issue ID
  const dbIssueId = await getDbIssueId(dbRepoId, pullRequest.number)
  if (!dbIssueId) {
    console.warn(`[notifications] PR #${pullRequest.number} not found in DB, skipping reopened notification`)
    return
  }

  // Get actor's internal ID
  const actorDbId = await ensureUser({
    id: actor.id,
    login: actor.login,
    avatar_url: actor.avatar_url
  })
  if (!actorDbId) return

  const notifiedIds = new Set<number>()

  // Notify PR author
  if (pullRequest.user) {
    const authorDbId = await getDbUserId(pullRequest.user.id)
    if (authorDbId && !shouldSkipSelfNotification(actorDbId, authorDbId)) {
      notifiedIds.add(authorDbId)
      await createNotification({
        userId: authorDbId,
        type: 'pull_request',
        action: 'reopened',
        repositoryId: dbRepoId,
        issueId: dbIssueId,
        actorId: actorDbId
      })
    }
  }

  // Notify assignees
  for (const assignee of pullRequest.assignees || []) {
    const assigneeDbId = await getDbUserId(assignee.id)
    if (!assigneeDbId) continue
    if (notifiedIds.has(assigneeDbId)) continue
    if (shouldSkipSelfNotification(actorDbId, assigneeDbId)) continue
    notifiedIds.add(assigneeDbId)

    await createNotification({
      userId: assigneeDbId,
      type: 'pull_request',
      action: 'reopened',
      repositoryId: dbRepoId,
      issueId: dbIssueId,
      actorId: actorDbId
    })
  }

  // Notify activity subscribers who are subscribed to this PR
  const activitySubscribers = await getActivitySubscribersForIssue(dbRepoId, dbIssueId)
  for (const userId of activitySubscribers) {
    if (notifiedIds.has(userId)) continue
    if (shouldSkipSelfNotification(actorDbId, userId)) continue
    notifiedIds.add(userId)

    await createNotification({
      userId,
      type: 'pull_request',
      action: 'reopened',
      repositoryId: dbRepoId,
      issueId: dbIssueId,
      actorId: actorDbId
    })
  }
}

export async function notifyPRAssigned(
  pullRequest: GitHubPullRequest,
  repository: GitHubRepository,
  assignee: GitHubUser,
  actor: GitHubUser
) {
  // Get internal repository ID
  const dbRepoId = await getDbRepositoryId(repository.id)
  if (!dbRepoId) return

  // Get internal user IDs
  const actorDbId = await ensureUser({
    id: actor.id,
    login: actor.login,
    avatar_url: actor.avatar_url
  })
  if (!actorDbId) return

  const assigneeDbId = await ensureUser({
    id: assignee.id,
    login: assignee.login,
    avatar_url: assignee.avatar_url
  })
  if (!assigneeDbId) return

  // Don't notify if user assigned themselves - except in dev
  if (shouldSkipSelfNotification(actorDbId, assigneeDbId)) return

  // Look up the database issue ID
  const dbIssueId = await getDbIssueId(dbRepoId, pullRequest.number)
  if (!dbIssueId) {
    console.warn(`[notifications] PR #${pullRequest.number} not found in DB, skipping assigned notification`)
    return
  }

  await createNotification({
    userId: assigneeDbId,
    type: 'pull_request',
    action: 'assigned',
    repositoryId: dbRepoId,
    issueId: dbIssueId,
    actorId: actorDbId
  })
}

export async function notifyPRReviewRequested(
  pullRequest: GitHubPullRequest,
  repository: GitHubRepository,
  reviewer: GitHubUser,
  actor: GitHubUser
) {
  // Get internal repository ID
  const dbRepoId = await getDbRepositoryId(repository.id)
  if (!dbRepoId) return

  // Get internal user IDs
  const actorDbId = await ensureUser({
    id: actor.id,
    login: actor.login,
    avatar_url: actor.avatar_url
  })
  if (!actorDbId) return

  const reviewerDbId = await ensureUser({
    id: reviewer.id,
    login: reviewer.login,
    avatar_url: reviewer.avatar_url
  })
  if (!reviewerDbId) return

  // Don't notify if user requested review from themselves - except in dev
  if (shouldSkipSelfNotification(actorDbId, reviewerDbId)) return

  // Look up the database issue ID
  const dbIssueId = await getDbIssueId(dbRepoId, pullRequest.number)
  if (!dbIssueId) {
    console.warn(`[notifications] PR #${pullRequest.number} not found in DB, skipping review_requested notification`)
    return
  }

  await createNotification({
    userId: reviewerDbId,
    type: 'pull_request',
    action: 'review_requested',
    repositoryId: dbRepoId,
    issueId: dbIssueId,
    actorId: actorDbId
  })
}

export async function notifyPRReadyForReview(
  pullRequest: GitHubPullRequest,
  repository: GitHubRepository,
  actor: GitHubUser
) {
  // Notify requested reviewers that the PR is ready
  const requestedReviewers = pullRequest.requested_reviewers || []
  if (requestedReviewers.length === 0) return

  // Get internal repository ID
  const dbRepoId = await getDbRepositoryId(repository.id)
  if (!dbRepoId) return

  // Look up the database issue ID
  const dbIssueId = await getDbIssueId(dbRepoId, pullRequest.number)
  if (!dbIssueId) {
    console.warn(`[notifications] PR #${pullRequest.number} not found in DB, skipping ready_for_review notification`)
    return
  }

  // Get actor's internal ID
  const actorDbId = await ensureUser({
    id: actor.id,
    login: actor.login,
    avatar_url: actor.avatar_url
  })
  if (!actorDbId) return

  for (const reviewer of requestedReviewers) {
    const reviewerDbId = await getDbUserId(reviewer.id)
    if (!reviewerDbId) continue
    if (shouldSkipSelfNotification(actorDbId, reviewerDbId)) continue

    await createNotification({
      userId: reviewerDbId,
      type: 'pull_request',
      action: 'ready_for_review',
      repositoryId: dbRepoId,
      issueId: dbIssueId,
      actorId: actorDbId
    })
  }
}

export async function notifyPRReviewDismissed(
  pullRequest: GitHubPullRequest,
  review: GitHubReview,
  repository: GitHubRepository,
  actor: GitHubUser
) {
  // Notify the reviewer whose review was dismissed
  if (!review.user) return

  // Get internal repository ID
  const dbRepoId = await getDbRepositoryId(repository.id)
  if (!dbRepoId) return

  // Get internal user IDs
  const actorDbId = await ensureUser({
    id: actor.id,
    login: actor.login,
    avatar_url: actor.avatar_url
  })
  if (!actorDbId) return

  const reviewerDbId = await getDbUserId(review.user.id)
  if (!reviewerDbId) return
  if (shouldSkipSelfNotification(actorDbId, reviewerDbId)) return

  // Look up the database issue ID
  const dbIssueId = await getDbIssueId(dbRepoId, pullRequest.number)
  if (!dbIssueId) {
    console.warn(`[notifications] PR #${pullRequest.number} not found in DB, skipping review_dismissed notification`)
    return
  }

  await createNotification({
    userId: reviewerDbId,
    type: 'pull_request',
    action: 'review_dismissed',
    repositoryId: dbRepoId,
    issueId: dbIssueId,
    actorId: actorDbId
  })
}

export async function notifyPRReviewSubmitted(
  pullRequest: GitHubPullRequest,
  review: GitHubReview,
  repository: GitHubRepository,
  actor: GitHubUser
) {
  // Get internal repository ID
  const dbRepoId = await getDbRepositoryId(repository.id)
  if (!dbRepoId) return

  // Look up the database issue ID
  const dbIssueId = await getDbIssueId(dbRepoId, pullRequest.number)
  if (!dbIssueId) {
    console.warn(`[notifications] PR #${pullRequest.number} not found in DB, skipping review notification`)
    return
  }

  // Get actor's internal ID
  const actorDbId = await ensureUser({
    id: actor.id,
    login: actor.login,
    avatar_url: actor.avatar_url
  })
  if (!actorDbId) return

  const notifiedIds = new Set<number>()

  // Notify PR author
  if (pullRequest.user) {
    const authorDbId = await getDbUserId(pullRequest.user.id)
    if (authorDbId && !shouldSkipSelfNotification(actorDbId, authorDbId)) {
      notifiedIds.add(authorDbId)
      await createNotification({
        userId: authorDbId,
        type: 'pull_request',
        action: 'review_submitted',
        body: truncate(review.body, 200),
        repositoryId: dbRepoId,
        issueId: dbIssueId,
        actorId: actorDbId
      })
    }
  }

  // Notify mentioned users in review body (who have mentions enabled)
  const mentionedUserIds = await getMentionedUserIds(review.body)
  const mentionSubscribers = await getSubscribers(dbRepoId, 'mentions')
  const mentionSubscriberIds = new Set(mentionSubscribers.map(s => s.userId))

  for (const userId of mentionedUserIds) {
    if (notifiedIds.has(userId)) continue
    if (shouldSkipSelfNotification(actorDbId, userId)) continue
    if (!mentionSubscriberIds.has(userId)) continue
    notifiedIds.add(userId)

    await createNotification({
      userId,
      type: 'pull_request',
      action: 'mentioned',
      body: truncate(review.body, 200),
      repositoryId: dbRepoId,
      issueId: dbIssueId,
      actorId: actorDbId
    })
  }

  // Notify activity subscribers who are subscribed to this PR
  const activitySubscribers = await getActivitySubscribersForIssue(dbRepoId, dbIssueId)
  for (const userId of activitySubscribers) {
    if (notifiedIds.has(userId)) continue
    if (shouldSkipSelfNotification(actorDbId, userId)) continue
    notifiedIds.add(userId)

    await createNotification({
      userId,
      type: 'pull_request',
      action: 'review_submitted',
      body: truncate(review.body, 200),
      repositoryId: dbRepoId,
      issueId: dbIssueId,
      actorId: actorDbId
    })
  }
}

export async function notifyPRComment(
  pullRequest: GitHubPullRequest,
  comment: GitHubComment,
  repository: GitHubRepository,
  actor: GitHubUser
) {
  // Skip notifications from bots
  if (isBot(actor)) return

  // Get internal repository ID
  const dbRepoId = await getDbRepositoryId(repository.id)
  if (!dbRepoId) return

  // Look up the database issue ID
  const dbIssueId = await getDbIssueId(dbRepoId, pullRequest.number)
  if (!dbIssueId) {
    console.warn(`[notifications] PR #${pullRequest.number} not found in DB, skipping comment notification`)
    return
  }

  // Get actor's internal ID
  const actorDbId = await ensureUser({
    id: actor.id,
    login: actor.login,
    avatar_url: actor.avatar_url
  })
  if (!actorDbId) return

  const notifiedIds = new Set<number>()

  // Notify PR author
  if (pullRequest.user) {
    const authorDbId = await getDbUserId(pullRequest.user.id)
    if (authorDbId && !shouldSkipSelfNotification(actorDbId, authorDbId)) {
      notifiedIds.add(authorDbId)
      await createNotification({
        userId: authorDbId,
        type: 'pull_request',
        action: 'comment',
        body: truncate(comment.body, 200),
        repositoryId: dbRepoId,
        issueId: dbIssueId,
        actorId: actorDbId
      })
    }
  }

  // Notify assignees
  for (const assignee of pullRequest.assignees || []) {
    const assigneeDbId = await getDbUserId(assignee.id)
    if (!assigneeDbId) continue
    if (notifiedIds.has(assigneeDbId)) continue
    if (shouldSkipSelfNotification(actorDbId, assigneeDbId)) continue
    notifiedIds.add(assigneeDbId)

    await createNotification({
      userId: assigneeDbId,
      type: 'pull_request',
      action: 'comment',
      body: truncate(comment.body, 200),
      repositoryId: dbRepoId,
      issueId: dbIssueId,
      actorId: actorDbId
    })
  }

  // Notify mentioned users (who have mentions enabled)
  const mentionedUserIds = await getMentionedUserIds(comment.body)
  const mentionSubscribers = await getSubscribers(dbRepoId, 'mentions')
  const mentionSubscriberIds = new Set(mentionSubscribers.map(s => s.userId))

  for (const userId of mentionedUserIds) {
    if (notifiedIds.has(userId)) continue
    if (shouldSkipSelfNotification(actorDbId, userId)) continue
    if (!mentionSubscriberIds.has(userId)) continue
    notifiedIds.add(userId)

    await createNotification({
      userId,
      type: 'pull_request',
      action: 'mentioned',
      body: truncate(comment.body, 200),
      repositoryId: dbRepoId,
      issueId: dbIssueId,
      actorId: actorDbId
    })
  }

  // Notify activity subscribers who are subscribed to this PR
  const activitySubscribers = await getActivitySubscribersForIssue(dbRepoId, dbIssueId)
  for (const userId of activitySubscribers) {
    if (notifiedIds.has(userId)) continue
    if (shouldSkipSelfNotification(actorDbId, userId)) continue
    notifiedIds.add(userId)

    await createNotification({
      userId,
      type: 'pull_request',
      action: 'comment',
      body: truncate(comment.body, 200),
      repositoryId: dbRepoId,
      issueId: dbIssueId,
      actorId: actorDbId
    })
  }
}

export async function notifyPRMerged(
  pullRequest: GitHubPullRequest,
  repository: GitHubRepository,
  actor: GitHubUser
) {
  // Get internal repository ID
  const dbRepoId = await getDbRepositoryId(repository.id)
  if (!dbRepoId) return

  // Look up the database issue ID
  const dbIssueId = await getDbIssueId(dbRepoId, pullRequest.number)
  if (!dbIssueId) {
    console.warn(`[notifications] PR #${pullRequest.number} not found in DB, skipping merged notification`)
    return
  }

  // Get actor's internal ID
  const actorDbId = await ensureUser({
    id: actor.id,
    login: actor.login,
    avatar_url: actor.avatar_url
  })
  if (!actorDbId) return

  const notifiedIds = new Set<number>()

  // Notify PR author
  if (pullRequest.user) {
    const authorDbId = await getDbUserId(pullRequest.user.id)
    if (authorDbId && !shouldSkipSelfNotification(actorDbId, authorDbId)) {
      notifiedIds.add(authorDbId)
      await createNotification({
        userId: authorDbId,
        type: 'pull_request',
        action: 'merged',
        repositoryId: dbRepoId,
        issueId: dbIssueId,
        actorId: actorDbId
      })
    }
  }

  // Notify assignees
  for (const assignee of pullRequest.assignees || []) {
    const assigneeDbId = await getDbUserId(assignee.id)
    if (!assigneeDbId) continue
    if (notifiedIds.has(assigneeDbId)) continue
    if (shouldSkipSelfNotification(actorDbId, assigneeDbId)) continue
    notifiedIds.add(assigneeDbId)

    await createNotification({
      userId: assigneeDbId,
      type: 'pull_request',
      action: 'merged',
      repositoryId: dbRepoId,
      issueId: dbIssueId,
      actorId: actorDbId
    })
  }

  // Notify activity subscribers who are subscribed to this PR
  const activitySubscribers = await getActivitySubscribersForIssue(dbRepoId, dbIssueId)
  for (const userId of activitySubscribers) {
    if (notifiedIds.has(userId)) continue
    if (shouldSkipSelfNotification(actorDbId, userId)) continue
    notifiedIds.add(userId)

    await createNotification({
      userId,
      type: 'pull_request',
      action: 'merged',
      repositoryId: dbRepoId,
      issueId: dbIssueId,
      actorId: actorDbId
    })
  }
}

export async function notifyPRClosed(
  pullRequest: GitHubPullRequest,
  repository: GitHubRepository,
  actor: GitHubUser
) {
  // Don't notify if merged (separate notification)
  if (pullRequest.merged) return

  // Get internal repository ID
  const dbRepoId = await getDbRepositoryId(repository.id)
  if (!dbRepoId) return

  // Look up the database issue ID
  const dbIssueId = await getDbIssueId(dbRepoId, pullRequest.number)
  if (!dbIssueId) {
    console.warn(`[notifications] PR #${pullRequest.number} not found in DB, skipping closed notification`)
    return
  }

  // Get actor's internal ID
  const actorDbId = await ensureUser({
    id: actor.id,
    login: actor.login,
    avatar_url: actor.avatar_url
  })
  if (!actorDbId) return

  const notifiedIds = new Set<number>()

  // Notify PR author
  if (pullRequest.user) {
    const authorDbId = await getDbUserId(pullRequest.user.id)
    if (authorDbId && !shouldSkipSelfNotification(actorDbId, authorDbId)) {
      notifiedIds.add(authorDbId)
      await createNotification({
        userId: authorDbId,
        type: 'pull_request',
        action: 'closed',
        repositoryId: dbRepoId,
        issueId: dbIssueId,
        actorId: actorDbId
      })
    }
  }

  // Notify assignees
  for (const assignee of pullRequest.assignees || []) {
    const assigneeDbId = await getDbUserId(assignee.id)
    if (!assigneeDbId) continue
    if (notifiedIds.has(assigneeDbId)) continue
    if (shouldSkipSelfNotification(actorDbId, assigneeDbId)) continue
    notifiedIds.add(assigneeDbId)

    await createNotification({
      userId: assigneeDbId,
      type: 'pull_request',
      action: 'closed',
      repositoryId: dbRepoId,
      issueId: dbIssueId,
      actorId: actorDbId
    })
  }

  // Notify activity subscribers who are subscribed to this PR
  const activitySubscribers = await getActivitySubscribersForIssue(dbRepoId, dbIssueId)
  for (const userId of activitySubscribers) {
    if (notifiedIds.has(userId)) continue
    if (shouldSkipSelfNotification(actorDbId, userId)) continue
    notifiedIds.add(userId)

    await createNotification({
      userId,
      type: 'pull_request',
      action: 'closed',
      repositoryId: dbRepoId,
      issueId: dbIssueId,
      actorId: actorDbId
    })
  }
}

// ============================================================================
// Release Notifications
// ============================================================================

export async function notifyReleasePublished(
  release: GitHubRelease,
  repository: GitHubRepository,
  actor: GitHubUser
) {
  // Get internal repository ID
  const dbRepoId = await getDbRepositoryId(repository.id)
  if (!dbRepoId) return

  // Get actor's internal ID
  const actorDbId = await ensureUser({
    id: actor.id,
    login: actor.login,
    avatar_url: actor.avatar_url
  })
  if (!actorDbId) return

  // Get release's internal ID
  const [dbRelease] = await db
    .select({ id: schema.releases.id })
    .from(schema.releases)
    .where(eq(schema.releases.githubId, release.id))
  const dbReleaseId = dbRelease?.id

  // Notify subscribers who want release notifications
  const subscribers = await getSubscribers(dbRepoId, 'releases')
  for (const subscriber of subscribers) {
    if (shouldSkipSelfNotification(actorDbId, subscriber.userId)) continue

    await createNotification({
      userId: subscriber.userId,
      type: 'release',
      action: 'published',
      body: release.name || release.tag_name,
      repositoryId: dbRepoId,
      releaseId: dbReleaseId,
      actorId: actorDbId
    })
  }
}

// ============================================================================
// Workflow Run Notifications
// ============================================================================

export async function notifyWorkflowFailed(
  workflowRun: GitHubWorkflowRun,
  repository: GitHubRepository,
  actor: GitHubUser
) {
  // Get internal repository ID
  const dbRepoId = await getDbRepositoryId(repository.id)
  if (!dbRepoId) return

  // Get actor's internal ID
  const actorDbId = await ensureUser({
    id: actor.id,
    login: actor.login,
    avatar_url: actor.avatar_url
  })

  // Find the related PR if this workflow was triggered by a pull_request event
  let issueId: number | undefined

  // First try using the pull_requests array from the webhook
  if (workflowRun.pull_requests?.length && workflowRun.pull_requests.length > 0) {
    const prNumber = workflowRun.pull_requests[0]!.number
    const dbIssueId = await getDbIssueId(dbRepoId, prNumber)
    if (dbIssueId) {
      issueId = dbIssueId
    }
  }

  // Fallback: if triggered by pull_request event but pull_requests array is empty
  // (common for PRs from forks due to GitHub security restrictions),
  // try to find the PR by matching the head SHA
  if (!issueId && workflowRun.event === 'pull_request' && workflowRun.head_sha) {
    const [relatedPR] = await db.select({ id: schema.issues.id }).from(schema.issues).where(
      and(
        eq(schema.issues.repositoryId, dbRepoId),
        eq(schema.issues.pullRequest, true),
        eq(schema.issues.headSha, workflowRun.head_sha)
      )
    )
    if (relatedPR) {
      issueId = relatedPR.id
    }
  }

  // For pull_request events, skip notification if no PR was found
  // (PR might not be synced or user doesn't care about it)
  if (workflowRun.event === 'pull_request' && !issueId) {
    return
  }

  // Get workflow run's internal ID
  const [dbWorkflowRun] = await db
    .select({ id: schema.workflowRuns.id })
    .from(schema.workflowRuns)
    .where(eq(schema.workflowRuns.githubId, workflowRun.id))
  const dbWorkflowRunId = dbWorkflowRun?.id

  // Notify subscribers who want CI failure notifications
  const subscribers = await getSubscribers(dbRepoId, 'ci')
  for (const subscriber of subscribers) {
    // Don't skip self-notification for CI - you want to know if your own build failed
    await createNotification({
      userId: subscriber.userId,
      type: 'workflow_run',
      action: 'failed',
      body: workflowRun.name || workflowRun.display_title || workflowRun.workflow?.name,
      repositoryId: dbRepoId,
      issueId,
      workflowRunId: dbWorkflowRunId,
      actorId: actorDbId ?? undefined
    })
  }
}

export async function notifyWorkflowSuccess(
  _workflowRun: GitHubWorkflowRun,
  _repository: GitHubRepository,
  _actor: GitHubUser
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
