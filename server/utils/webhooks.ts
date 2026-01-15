import { eq, and, sql } from 'drizzle-orm'
import { db, schema } from 'hub:db'
import type { ReviewState } from '../db/schema'
import type {
  GitHubUser,
  GitHubRepository,
  GitHubIssue,
  GitHubPullRequest,
  GitHubIssueOrPR,
  GitHubComment,
  GitHubReview,
  GitHubReviewComment,
  GitHubLabel,
  GitHubMilestone,
  GitHubRelease,
  GitHubWorkflowRun,
  GitHubCheckRun,
  GitHubInstallation,
  GitHubInstallationRepository
} from '../types/github'
import { ensureUser, getDbUserId, getDbRepositoryId, getDbInstallationId } from './users'
import { subscribeUserToIssue, ensureType, updateLinkedIssues, fetchLinkedIssueNumbers, getDbLabelId, getDbMilestoneId } from './sync'
import { useOctokitAsInstallation } from './octokit'

// ============================================================================
// Issues
// ============================================================================

export async function handleIssueEvent(action: string, issue: GitHubIssue, repository: GitHubRepository, _installationId?: number, sender?: GitHubUser | null) {
  // Check if repository is synced (lookup by GitHub ID)
  const dbRepoId = await getDbRepositoryId(repository.id)
  if (!dbRepoId) {
    console.log(`[Webhook] Repository ${repository.full_name} not synced, skipping issue event`)
    return
  }

  switch (action) {
    case 'opened':
    case 'edited':
    case 'reopened':
    case 'closed':
    case 'assigned':
    case 'unassigned':
    case 'labeled':
    case 'unlabeled':
    case 'milestoned':
    case 'demilestoned':
    case 'locked':
    case 'unlocked':
    case 'typed':
    case 'untyped':
      await upsertIssue(issue, dbRepoId, repository.full_name, false, action, sender)
      break
    case 'deleted':
    case 'transferred':
      // Delete by repositoryId + number to handle different ID sources
      await db.delete(schema.issues).where(
        and(
          eq(schema.issues.repositoryId, dbRepoId),
          eq(schema.issues.number, issue.number)
        )
      )
      break
  }
}

// ============================================================================
// Pull Requests
// ============================================================================

export async function handlePullRequestEvent(action: string, pullRequest: GitHubPullRequest, repository: GitHubRepository, installationId?: number, sender?: GitHubUser | null) {
  // Check if repository is synced (lookup by GitHub ID)
  const dbRepoId = await getDbRepositoryId(repository.id)
  if (!dbRepoId) {
    console.log(`[Webhook] Repository ${repository.full_name} not synced, skipping PR event`)
    return
  }

  switch (action) {
    case 'opened':
    case 'edited':
    case 'reopened':
    case 'closed':
    case 'assigned':
    case 'unassigned':
    case 'labeled':
    case 'unlabeled':
    case 'milestoned':
    case 'demilestoned':
    case 'locked':
    case 'unlocked':
    case 'ready_for_review':
    case 'converted_to_draft':
    case 'review_requested':
    case 'review_request_removed':
    case 'synchronize': {
      const prId = await upsertIssue(pullRequest, dbRepoId, repository.full_name, true, action, sender)

      // Update linked issues using GitHub's closingIssuesReferences API
      if (installationId && (action === 'opened' || action === 'edited' || action === 'reopened')) {
        try {
          const [owner, repoName] = repository.full_name.split('/') as [string, string]
          const octokit = await useOctokitAsInstallation(installationId)
          const linkedIssueNumbers = await fetchLinkedIssueNumbers(octokit, owner!, repoName!, pullRequest.number)
          await updateLinkedIssues(prId, dbRepoId, linkedIssueNumbers)
        } catch (error) {
          console.warn(`[Webhook] Failed to update linked issues for PR #${pullRequest.number}:`, error)
        }
      }
      break
    }
  }
}

// ============================================================================
// Issues (Issues & Pull Requests unified)
// ============================================================================

async function upsertIssue(item: GitHubIssueOrPR, repositoryId: number, _repositoryFullName: string, isPullRequest: boolean, action?: string, sender?: GitHubUser | null): Promise<number> {
  // Ensure author exists as shadow user and get internal ID
  let userId: number | null = null
  if (item.user) {
    userId = await ensureUser({
      id: item.user.id,
      login: item.user.login,
      avatar_url: item.user.avatar_url
    })
  }

  // Ensure closed_by user exists and get internal ID
  // Note: GitHub webhook payloads for 'closed' events do NOT include closed_by on the issue/PR object.
  // The closed_by field is only available via REST API. For webhooks, we use the sender (who performed the action).
  let closedById: number | null = null
  const closedByUser = item.closed_by || (action === 'closed' ? sender : null)
  if (closedByUser) {
    closedById = await ensureUser({
      id: closedByUser.id,
      login: closedByUser.login,
      avatar_url: closedByUser.avatar_url
    })
  }

  // Ensure merged_by user exists (PRs only) and get internal ID
  let mergedById: number | null = null
  if (item.merged_by) {
    mergedById = await ensureUser({
      id: item.merged_by.id,
      login: item.merged_by.login,
      avatar_url: item.merged_by.avatar_url
    })
  }

  // Ensure type exists if present (issues only)
  let typeId: number | null = null
  if (!isPullRequest && item.type?.id) {
    typeId = await ensureType(repositoryId, {
      id: item.type.id,
      name: item.type.name,
      color: item.type.color,
      description: item.type.description
    })
  }

  // Get milestone ID if present
  let milestoneId: number | null = null
  if (item.milestone?.id) {
    milestoneId = await getDbMilestoneId(item.milestone.id)
  }

  const itemData: any = {
    githubId: item.id, // Store GitHub's ID for reference (not reliable as primary key)
    pullRequest: isPullRequest,
    repositoryId,
    milestoneId,
    typeId,
    userId,
    number: item.number,
    title: item.title,
    body: item.body,
    state: item.state,
    htmlUrl: item.html_url,
    locked: item.locked,
    closedAt: item.closed_at ? new Date(item.closed_at) : null,
    closedById,
    // Engagement metrics from GitHub webhook payload
    reactionCount: item.reactions?.total_count ?? 0,
    commentCount: item.comments ?? 0,
    // Use GitHub timestamps
    createdAt: new Date(item.created_at),
    updatedAt: new Date(item.updated_at)
  }

  // Issue-specific fields
  if (!isPullRequest) {
    itemData.stateReason = item.state_reason
  }

  // PR-specific fields
  if (isPullRequest) {
    itemData.draft = item.draft
    // Only set merged if we have explicit merge data (not undefined from partial payloads)
    // merged_at being a truthy string means PR is merged
    // merged being explicitly true also means PR is merged
    itemData.merged = !!item.merged_at || item.merged === true
    itemData.commits = item.commits
    itemData.additions = item.additions
    itemData.deletions = item.deletions
    itemData.changedFiles = item.changed_files
    itemData.headRef = item.head?.ref
    itemData.headSha = item.head?.sha
    itemData.baseRef = item.base?.ref
    itemData.baseSha = item.base?.sha
    itemData.mergedAt = item.merged_at ? new Date(item.merged_at) : null
    itemData.mergedById = mergedById
  }

  // Look up by repositoryId + number (unique) instead of id
  // because GitHub returns different IDs for issues vs PRs
  const [existing] = await db.select().from(schema.issues).where(
    and(
      eq(schema.issues.repositoryId, repositoryId),
      eq(schema.issues.number, item.number)
    )
  )

  let itemId: number

  if (existing) {
    // Update existing issue - don't change synced status
    await db.update(schema.issues).set(itemData).where(eq(schema.issues.id, existing.id))
    itemId = existing.id
  } else {
    // NEW issue/PR - determine if we can mark it as synced
    // Webhooks keep data up-to-date incrementally, so we can skip the initial sync IF:
    // - It's an OPEN issue/PR with no comments (truly new, no historical data to fetch)
    // - Closed/merged items synced on-demand may have historical data we need to fetch
    const isOpen = item.state === 'open'
    const hasNoComments = (item.comments ?? 0) === 0
    const canSkipSync = isOpen && hasNoComments

    if (canSkipSync) {
      itemData.synced = true
      itemData.syncedAt = new Date()
    }

    // Insert without specifying id - let serial auto-generate it
    const [inserted] = await db.insert(schema.issues).values(itemData).returning({ id: schema.issues.id })
    itemId = inserted!.id

    // Subscribe author to the new issue/PR
    if (userId) {
      await subscribeUserToIssue(itemId, userId)
    }
  }

  // Sync assignees
  await syncIssueAssignees(itemId, item.assignees || [])

  // Sync labels
  const labelGithubIds = item.labels?.map((l: any) => l.id).filter(Boolean) || []
  await syncIssueLabels(itemId, labelGithubIds)

  // Sync requested reviewers (PRs only)
  if (isPullRequest) {
    const reviewers = item.requested_reviewers?.filter((r: any) => r.id) || []
    await syncIssueRequestedReviewers(itemId, reviewers)
  }

  return itemId
}

// Helper: sync issue assignees
async function syncIssueAssignees(issueId: number, assignees: GitHubUser[]) {
  // Get existing assignees
  const existingAssignees = await db
    .select()
    .from(schema.issueAssignees)
    .where(eq(schema.issueAssignees.issueId, issueId))

  const existingIds = new Set(existingAssignees.map(a => a.userId))

  // Build map of GitHub ID -> internal ID for new assignees
  const newAssigneeDbIds = new Map<number, number>()
  for (const assignee of assignees) {
    const dbUserId = await ensureUser({
      id: assignee.id,
      login: assignee.login,
      avatar_url: assignee.avatar_url
    })
    if (dbUserId) {
      newAssigneeDbIds.set(assignee.id, dbUserId)
    }
  }

  const newDbIds = new Set(newAssigneeDbIds.values())

  // Delete removed assignees
  for (const existing of existingAssignees) {
    if (!newDbIds.has(existing.userId)) {
      await db.delete(schema.issueAssignees).where(
        and(
          eq(schema.issueAssignees.issueId, issueId),
          eq(schema.issueAssignees.userId, existing.userId)
        )
      )
    }
  }

  // Insert new assignees
  for (const [_githubId, dbUserId] of newAssigneeDbIds) {
    if (!existingIds.has(dbUserId)) {
      await db.insert(schema.issueAssignees)
        .values({ issueId, userId: dbUserId })
        .onConflictDoNothing()
    }

    // Auto-subscribe assignee to the issue
    await subscribeUserToIssue(issueId, dbUserId)
  }
}

// Helper: sync issue labels
async function syncIssueLabels(issueId: number, labelGithubIds: number[]) {
  // Get existing labels
  const existingLabels = await db
    .select()
    .from(schema.issueLabels)
    .where(eq(schema.issueLabels.issueId, issueId))

  const existingDbIds = new Set(existingLabels.map(l => l.labelId))

  // Convert GitHub IDs to internal IDs
  const newDbIds = new Set<number>()
  for (const githubId of labelGithubIds) {
    const dbId = await getDbLabelId(githubId)
    if (dbId) {
      newDbIds.add(dbId)
    }
  }

  // Delete removed labels
  for (const existing of existingLabels) {
    if (!newDbIds.has(existing.labelId)) {
      await db.delete(schema.issueLabels).where(
        and(
          eq(schema.issueLabels.issueId, issueId),
          eq(schema.issueLabels.labelId, existing.labelId)
        )
      )
    }
  }

  // Insert new labels (only if label exists in our DB)
  for (const dbLabelId of newDbIds) {
    if (!existingDbIds.has(dbLabelId)) {
      try {
        await db.insert(schema.issueLabels)
          .values({ issueId, labelId: dbLabelId })
          .onConflictDoNothing()
      } catch {
        // Label may not exist in our DB yet - skip
      }
    }
  }
}

// Helper: sync issue requested reviewers
async function syncIssueRequestedReviewers(issueId: number, reviewers: GitHubUser[]) {
  // Get existing reviewers
  const existingReviewers = await db
    .select()
    .from(schema.issueRequestedReviewers)
    .where(eq(schema.issueRequestedReviewers.issueId, issueId))

  const existingIds = new Set(existingReviewers.map(r => r.userId))

  // Build map of GitHub ID -> internal ID for new reviewers
  const newReviewerDbIds = new Map<number, number>()
  for (const reviewer of reviewers) {
    const dbUserId = await ensureUser({
      id: reviewer.id,
      login: reviewer.login,
      avatar_url: reviewer.avatar_url
    })
    if (dbUserId) {
      newReviewerDbIds.set(reviewer.id, dbUserId)
    }
  }

  const newDbIds = new Set(newReviewerDbIds.values())

  // Delete removed reviewers
  for (const existing of existingReviewers) {
    if (!newDbIds.has(existing.userId)) {
      await db.delete(schema.issueRequestedReviewers).where(
        and(
          eq(schema.issueRequestedReviewers.issueId, issueId),
          eq(schema.issueRequestedReviewers.userId, existing.userId)
        )
      )
    }
  }

  // Insert new reviewers
  for (const [_githubId, dbUserId] of newReviewerDbIds) {
    if (!existingIds.has(dbUserId)) {
      await db.insert(schema.issueRequestedReviewers)
        .values({ issueId, userId: dbUserId })
        .onConflictDoNothing()
    }

    // Auto-subscribe reviewer to the PR
    await subscribeUserToIssue(issueId, dbUserId)
  }
}

// ============================================================================
// Comments
// ============================================================================

export async function handleCommentEvent(action: string, comment: GitHubComment, issue: GitHubIssue, repository: GitHubRepository, _installationId?: number) {
  // Check if repository is synced (lookup by GitHub ID)
  const dbRepoId = await getDbRepositoryId(repository.id)
  if (!dbRepoId) {
    console.log(`[Webhook] Repository ${repository.full_name} not synced, skipping comment event`)
    return
  }

  // Check if the issue exists in our DB (lookup by repositoryId + number, not id)
  let [existingIssue] = await db.select().from(schema.issues).where(
    and(
      eq(schema.issues.repositoryId, dbRepoId),
      eq(schema.issues.number, issue.number)
    )
  )

  // If issue doesn't exist, sync it on-demand (e.g., comment on closed issue)
  if (!existingIssue) {
    console.log(`[Webhook] Issue #${issue.number} not synced, syncing on-demand for comment event`)
    const isPullRequest = 'pull_request' in issue && issue.pull_request !== undefined
    const issueId = await upsertIssue(issue as GitHubIssueOrPR, dbRepoId, repository.full_name, isPullRequest)

    const [newIssue] = await db.select().from(schema.issues).where(eq(schema.issues.id, issueId))
    existingIssue = newIssue
  }

  // Upsert the comment and update comment count
  switch (action) {
    case 'created':
      await upsertComment(comment, existingIssue!.id)
      // Increment comment count
      await db.update(schema.issues)
        .set({ commentCount: sql`${schema.issues.commentCount} + 1` })
        .where(eq(schema.issues.id, existingIssue!.id))
      // Subscribe commenter to the issue
      if (comment.user?.id) {
        const dbUserId = await getDbUserId(comment.user.id)
        if (dbUserId) {
          await subscribeUserToIssue(existingIssue!.id, dbUserId)
        }
      }
      break
    case 'edited':
      await upsertComment(comment, existingIssue!.id)
      break
    case 'deleted':
      await db.delete(schema.issueComments).where(eq(schema.issueComments.githubId, comment.id))
      // Decrement comment count
      await db.update(schema.issues)
        .set({ commentCount: sql`GREATEST(${schema.issues.commentCount} - 1, 0)` })
        .where(eq(schema.issues.id, existingIssue!.id))
      break
  }
}

async function upsertComment(comment: GitHubComment, issueId: number) {
  // Ensure author exists as shadow user and get internal ID
  let userId: number | null = null
  if (comment.user) {
    userId = await ensureUser({
      id: comment.user.id,
      login: comment.user.login,
      avatar_url: comment.user.avatar_url
    })
  }

  const commentData = {
    issueId,
    userId,
    body: comment.body || '',
    htmlUrl: comment.html_url,
    createdAt: new Date(comment.created_at),
    updatedAt: new Date(comment.updated_at)
  }

  const [existing] = await db.select().from(schema.issueComments).where(eq(schema.issueComments.githubId, comment.id))

  if (existing) {
    await db.update(schema.issueComments).set(commentData).where(eq(schema.issueComments.id, existing.id))
  } else {
    await db.insert(schema.issueComments).values({
      githubId: comment.id,
      ...commentData
    })
  }
}

// ============================================================================
// PR Reviews
// ============================================================================

export async function handleReviewEvent(action: string, review: GitHubReview, pullRequest: GitHubPullRequest, repository: GitHubRepository, _installationId?: number) {
  // Check if repository is synced (lookup by GitHub ID)
  const dbRepoId = await getDbRepositoryId(repository.id)
  if (!dbRepoId) {
    console.log(`[Webhook] Repository ${repository.full_name} not synced, skipping review event`)
    return
  }

  // Check if the PR exists in our DB (lookup by repositoryId + number, not id)
  let [existingPR] = await db.select().from(schema.issues).where(
    and(
      eq(schema.issues.repositoryId, dbRepoId),
      eq(schema.issues.number, pullRequest.number)
    )
  )

  // If PR doesn't exist, sync it on-demand (e.g., review on closed PR)
  if (!existingPR) {
    console.log(`[Webhook] PR #${pullRequest.number} not synced, syncing on-demand for review event`)
    const prId = await upsertIssue(pullRequest as GitHubIssueOrPR, dbRepoId, repository.full_name, true)

    const [newPR] = await db.select().from(schema.issues).where(eq(schema.issues.id, prId))
    existingPR = newPR
  }

  switch (action) {
    case 'submitted':
      await upsertReview(review, existingPR!.id)
      // Subscribe reviewer to the PR
      if (review.user?.id) {
        const dbUserId = await getDbUserId(review.user.id)
        if (dbUserId) {
          await subscribeUserToIssue(existingPR!.id, dbUserId)
        }
      }
      break
    case 'edited':
      await upsertReview(review, existingPR!.id)
      break
    case 'dismissed':
      await db.update(schema.issueReviews).set({
        state: 'DISMISSED',
        updatedAt: new Date()
      }).where(eq(schema.issueReviews.githubId, review.id))
      break
  }
}

async function upsertReview(review: GitHubReview, issueId: number) {
  let userId: number | null = null
  if (review.user) {
    userId = await ensureUser({
      id: review.user.id,
      login: review.user.login,
      avatar_url: review.user.avatar_url
    })
  }

  const reviewData = {
    issueId,
    userId,
    body: review.body,
    state: review.state as ReviewState,
    htmlUrl: review.html_url,
    commitId: review.commit_id,
    submittedAt: review.submitted_at ? new Date(review.submitted_at) : null,
    updatedAt: new Date()
  }

  const [existing] = await db.select().from(schema.issueReviews).where(eq(schema.issueReviews.githubId, review.id))

  if (existing) {
    await db.update(schema.issueReviews).set(reviewData).where(eq(schema.issueReviews.id, existing.id))
  } else {
    await db.insert(schema.issueReviews).values({
      githubId: review.id,
      ...reviewData
    })
  }
}

// ============================================================================
// PR Review Comments
// ============================================================================

export async function handleReviewCommentEvent(action: string, comment: GitHubReviewComment, pullRequest: GitHubPullRequest, repository: GitHubRepository, _installationId?: number) {
  // Check if repository is synced (lookup by GitHub ID)
  const dbRepoId = await getDbRepositoryId(repository.id)
  if (!dbRepoId) {
    console.log(`[Webhook] Repository ${repository.full_name} not synced, skipping review comment event`)
    return
  }

  // Check if the PR exists in our DB (lookup by repositoryId + number, not id)
  let [existingPR] = await db.select().from(schema.issues).where(
    and(
      eq(schema.issues.repositoryId, dbRepoId),
      eq(schema.issues.number, pullRequest.number)
    )
  )

  // If PR doesn't exist, sync it on-demand (e.g., review comment on closed PR)
  if (!existingPR) {
    console.log(`[Webhook] PR #${pullRequest.number} not synced, syncing on-demand for review comment event`)
    const prId = await upsertIssue(pullRequest as GitHubIssueOrPR, dbRepoId, repository.full_name, true)

    const [newPR] = await db.select().from(schema.issues).where(eq(schema.issues.id, prId))
    existingPR = newPR
  }

  switch (action) {
    case 'created':
    case 'edited':
      await upsertReviewComment(comment, existingPR!.id)
      break
    case 'deleted':
      await db.delete(schema.issueReviewComments).where(eq(schema.issueReviewComments.githubId, comment.id))
      break
  }
}

async function upsertReviewComment(comment: GitHubReviewComment, issueId: number) {
  let userId: number | null = null
  if (comment.user) {
    userId = await ensureUser({
      id: comment.user.id,
      login: comment.user.login,
      avatar_url: comment.user.avatar_url
    })

    // Subscribe review commenter to the PR
    if (userId) {
      await subscribeUserToIssue(issueId, userId)
    }
  }

  // Get review ID if present
  let reviewId: number | null = null
  if (comment.pull_request_review_id) {
    const [review] = await db.select({ id: schema.issueReviews.id })
      .from(schema.issueReviews)
      .where(eq(schema.issueReviews.githubId, comment.pull_request_review_id))
    reviewId = review?.id ?? null
  }

  const commentData = {
    issueId,
    reviewId,
    userId,
    body: comment.body,
    path: comment.path,
    line: comment.line,
    side: comment.side,
    commitId: comment.commit_id,
    diffHunk: comment.diff_hunk,
    htmlUrl: comment.html_url,
    createdAt: new Date(comment.created_at),
    updatedAt: new Date(comment.updated_at)
  }

  const [existing] = await db.select().from(schema.issueReviewComments).where(eq(schema.issueReviewComments.githubId, comment.id))

  if (existing) {
    await db.update(schema.issueReviewComments).set(commentData).where(eq(schema.issueReviewComments.id, existing.id))
  } else {
    await db.insert(schema.issueReviewComments).values({
      githubId: comment.id,
      ...commentData
    })
  }
}

// ============================================================================
// Labels
// ============================================================================

export async function handleLabelEvent(action: string, label: GitHubLabel, repository: GitHubRepository) {
  // Check if repository is synced (lookup by GitHub ID)
  const dbRepoId = await getDbRepositoryId(repository.id)
  if (!dbRepoId) {
    console.log(`[Webhook] Repository ${repository.full_name} not synced, skipping label event`)
    return
  }

  switch (action) {
    case 'created':
    case 'edited':
      await upsertLabel(label, dbRepoId)
      break
    case 'deleted':
      await db.delete(schema.labels).where(eq(schema.labels.githubId, label.id))
      break
  }
}

async function upsertLabel(label: GitHubLabel, repositoryId: number) {
  const labelData = {
    repositoryId,
    name: label.name,
    color: label.color,
    description: label.description,
    default: label.default,
    updatedAt: new Date()
  }

  const [existing] = await db.select().from(schema.labels).where(eq(schema.labels.githubId, label.id))

  if (existing) {
    await db.update(schema.labels).set(labelData).where(eq(schema.labels.id, existing.id))
  } else {
    await db.insert(schema.labels).values({
      githubId: label.id,
      ...labelData
    })
  }
}

// ============================================================================
// Milestones
// ============================================================================

export async function handleMilestoneEvent(action: string, milestone: GitHubMilestone, repository: GitHubRepository) {
  // Check if repository is synced (lookup by GitHub ID)
  const dbRepoId = await getDbRepositoryId(repository.id)
  if (!dbRepoId) {
    console.log(`[Webhook] Repository ${repository.full_name} not synced, skipping milestone event`)
    return
  }

  switch (action) {
    case 'created':
    case 'edited':
    case 'opened':
    case 'closed':
      await upsertMilestone(milestone, dbRepoId)
      break
    case 'deleted':
      await db.delete(schema.milestones).where(eq(schema.milestones.githubId, milestone.id))
      break
  }
}

async function upsertMilestone(milestone: GitHubMilestone, repositoryId: number) {
  const milestoneData = {
    repositoryId,
    number: milestone.number,
    title: milestone.title,
    description: milestone.description,
    state: milestone.state,
    htmlUrl: milestone.html_url,
    openIssues: milestone.open_issues,
    closedIssues: milestone.closed_issues,
    dueOn: milestone.due_on ? new Date(milestone.due_on) : null,
    closedAt: milestone.closed_at ? new Date(milestone.closed_at) : null,
    updatedAt: new Date()
  }

  const [existing] = await db.select().from(schema.milestones).where(eq(schema.milestones.githubId, milestone.id))

  if (existing) {
    await db.update(schema.milestones).set(milestoneData).where(eq(schema.milestones.id, existing.id))
  } else {
    await db.insert(schema.milestones).values({
      githubId: milestone.id,
      ...milestoneData
    })
  }
}

// ============================================================================
// Repository Collaborators (Members)
// Note: Requires organization "Members" permission to receive these events
// ============================================================================

export async function handleMemberEvent(action: string, member: GitHubUser, repository: GitHubRepository) {
  // Check if repository is synced (lookup by GitHub ID)
  const dbRepoId = await getDbRepositoryId(repository.id)
  if (!dbRepoId) {
    console.log(`[Webhook] Repository ${repository.full_name} not synced, skipping member event`)
    return
  }

  switch (action) {
    case 'added': {
      // Ensure user exists and get internal ID
      const dbUserId = await ensureUser({
        id: member.id,
        login: member.login,
        avatar_url: member.avatar_url
      })
      if (!dbUserId) return

      // Add as collaborator (we don't get permission level from webhook, default to 'write')
      const [existingCollaborator] = await db
        .select()
        .from(schema.repositoryCollaborators)
        .where(and(
          eq(schema.repositoryCollaborators.repositoryId, dbRepoId),
          eq(schema.repositoryCollaborators.userId, dbUserId)
        ))

      if (!existingCollaborator) {
        await db.insert(schema.repositoryCollaborators)
          .values({ repositoryId: dbRepoId, userId: dbUserId, permission: 'write' })
          .onConflictDoNothing()
        console.log(`[Webhook] Added collaborator ${member.login} to ${repository.full_name}`)
      }

      // Also subscribe them to the repository
      const [existingSub] = await db
        .select()
        .from(schema.repositorySubscriptions)
        .where(and(
          eq(schema.repositorySubscriptions.repositoryId, dbRepoId),
          eq(schema.repositorySubscriptions.userId, dbUserId)
        ))

      if (!existingSub) {
        await db.insert(schema.repositorySubscriptions).values({
          repositoryId: dbRepoId,
          userId: dbUserId,
          issues: true,
          pullRequests: true,
          releases: true,
          ci: true,
          mentions: true,
          activity: true
        })
      }
      break
    }

    case 'removed': {
      const dbUserId = await getDbUserId(member.id)
      if (!dbUserId) return

      // Remove from collaborators
      await db.delete(schema.repositoryCollaborators).where(
        and(
          eq(schema.repositoryCollaborators.repositoryId, dbRepoId),
          eq(schema.repositoryCollaborators.userId, dbUserId)
        )
      )
      console.log(`[Webhook] Removed collaborator ${member.login} from ${repository.full_name}`)
      break
    }

    case 'edited':
      // Permission changed - we could update permission level here if needed
      console.log(`[Webhook] Collaborator ${member.login} permissions changed on ${repository.full_name}`)
      break
  }
}

// ============================================================================
// Repositories
// ============================================================================

export async function handleRepositoryEvent(action: string, repository: GitHubRepository) {
  const dbRepoId = await getDbRepositoryId(repository.id)

  switch (action) {
    case 'edited':
    case 'renamed':
      if (dbRepoId) {
        await updateRepository(repository, dbRepoId)
      }
      break
    case 'archived':
    case 'unarchived':
      if (dbRepoId) {
        await db.update(schema.repositories).set({
          archived: repository.archived,
          updatedAt: new Date()
        }).where(eq(schema.repositories.id, dbRepoId))
      }
      break
    case 'deleted':
      if (dbRepoId) {
        // Cascade will handle related data
        await db.delete(schema.repositories).where(eq(schema.repositories.id, dbRepoId))
      }
      break
    case 'privatized':
    case 'publicized':
      if (dbRepoId) {
        await db.update(schema.repositories).set({
          private: repository.private,
          updatedAt: new Date()
        }).where(eq(schema.repositories.id, dbRepoId))
      }
      break
  }
}

async function updateRepository(repository: GitHubRepository, dbRepoId: number) {
  await db.update(schema.repositories).set({
    name: repository.name,
    fullName: repository.full_name,
    description: repository.description,
    htmlUrl: repository.html_url,
    defaultBranch: repository.default_branch,
    archived: repository.archived,
    disabled: repository.disabled,
    private: repository.private,
    updatedAt: new Date()
  }).where(eq(schema.repositories.id, dbRepoId))
}

// ============================================================================
// Installations
// ============================================================================

export async function handleInstallationEvent(action: string, installation: GitHubInstallation, repositories?: GitHubInstallationRepository[]) {
  const dbInstallationId = await getDbInstallationId(installation.id)

  switch (action) {
    case 'created':
      await createInstallation(installation, repositories || [])
      break
    case 'deleted':
      if (dbInstallationId) {
        // Cascade will handle related data
        await db.delete(schema.installations).where(eq(schema.installations.id, dbInstallationId))
      }
      break
    case 'suspend':
      if (dbInstallationId) {
        await db.update(schema.installations).set({
          suspended: true,
          updatedAt: new Date()
        }).where(eq(schema.installations.id, dbInstallationId))
      }
      break
    case 'unsuspend':
      if (dbInstallationId) {
        await db.update(schema.installations).set({
          suspended: false,
          updatedAt: new Date()
        }).where(eq(schema.installations.id, dbInstallationId))
      }
      break
    case 'new_permissions_accepted':
      // Just log for now
      console.log(`[Webhook] Installation ${installation.id} accepted new permissions`)
      break
  }
}

async function createInstallation(installation: GitHubInstallation, _repositories: GitHubInstallationRepository[]) {
  const account = installation.account

  // Check if installation exists
  const [existing] = await db.select().from(schema.installations).where(eq(schema.installations.githubId, installation.id))

  if (existing) {
    await db.update(schema.installations).set({
      accountLogin: account.login,
      avatarUrl: account.avatar_url,
      suspended: false,
      updatedAt: new Date()
    }).where(eq(schema.installations.id, existing.id))
  } else {
    await db.insert(schema.installations).values({
      githubId: installation.id,
      accountId: account.id,
      accountLogin: account.login,
      accountType: account.type,
      avatarUrl: account.avatar_url
    })
  }
}

export async function handleInstallationRepositoriesEvent(action: string, installation: GitHubInstallation, _repositoriesAdded?: GitHubInstallationRepository[], repositoriesRemoved?: GitHubInstallationRepository[]) {
  const dbInstallationId = await getDbInstallationId(installation.id)
  if (!dbInstallationId) return

  switch (action) {
    case 'added':
      // Note: We don't create repository records here.
      // Repositories are only created when the user explicitly imports them via sync.
      // This ensures proper collaborator access is set up during import.
      break
    case 'removed':
      for (const repo of repositoriesRemoved || []) {
        await db.delete(schema.repositories).where(eq(schema.repositories.githubId, repo.id))
      }
      break
  }
}

// ============================================================================
// Releases
// ============================================================================

export async function handleReleaseEvent(action: string, release: GitHubRelease, repository: GitHubRepository) {
  // Check if repository is synced (lookup by GitHub ID)
  const dbRepoId = await getDbRepositoryId(repository.id)
  if (!dbRepoId) {
    console.log(`[Webhook] Repository ${repository.full_name} not synced, skipping release event`)
    return
  }

  if (action === 'published') {
    // Ensure author exists as shadow user and get internal ID
    let authorId: number | null = null
    if (release.author) {
      authorId = await ensureUser({
        id: release.author.id,
        login: release.author.login,
        avatar_url: release.author.avatar_url
      })
    }

    const [existing] = await db.select().from(schema.releases).where(eq(schema.releases.githubId, release.id))

    if (existing) {
      await db.update(schema.releases).set({
        tagName: release.tag_name,
        name: release.name,
        body: release.body,
        draft: release.draft,
        prerelease: release.prerelease,
        htmlUrl: release.html_url,
        publishedAt: release.published_at ? new Date(release.published_at) : null
      }).where(eq(schema.releases.id, existing.id))
    } else {
      await db.insert(schema.releases).values({
        githubId: release.id,
        repositoryId: dbRepoId,
        authorId,
        tagName: release.tag_name,
        name: release.name,
        body: release.body,
        draft: release.draft,
        prerelease: release.prerelease,
        htmlUrl: release.html_url,
        publishedAt: release.published_at ? new Date(release.published_at) : null
      })
    }
  } else if (action === 'deleted') {
    await db.delete(schema.releases).where(eq(schema.releases.githubId, release.id))
  }
}

// ============================================================================
// Workflow Runs
// ============================================================================

export async function handleWorkflowRunEvent(action: string, workflowRun: GitHubWorkflowRun, repository: GitHubRepository) {
  // Check if repository is synced (lookup by GitHub ID)
  const dbRepoId = await getDbRepositoryId(repository.id)
  if (!dbRepoId) {
    console.log(`[Webhook] Repository ${repository.full_name} not synced, skipping workflow run event`)
    return
  }

  if (action === 'completed') {
    // Ensure actor exists as shadow user and get internal ID
    let actorId: number | null = null
    if (workflowRun.actor) {
      actorId = await ensureUser({
        id: workflowRun.actor.id,
        login: workflowRun.actor.login,
        avatar_url: workflowRun.actor.avatar_url
      })
    }

    // Find the related PR if this workflow was triggered by a pull_request event
    let issueId: number | null = null

    // First try using the pull_requests array from the webhook
    if (workflowRun.pull_requests?.length && workflowRun.pull_requests.length > 0) {
      const prNumber = workflowRun.pull_requests[0]!.number
      const [relatedPR] = await db.select().from(schema.issues).where(
        and(
          eq(schema.issues.repositoryId, dbRepoId),
          eq(schema.issues.number, prNumber)
        )
      )
      if (relatedPR) {
        issueId = relatedPR.id
      }
    }

    // Fallback: if triggered by pull_request event but pull_requests array is empty
    // (common for PRs from forks due to GitHub security restrictions),
    // try to find the PR by matching the head SHA
    if (!issueId && workflowRun.event === 'pull_request' && workflowRun.head_sha) {
      const [relatedPR] = await db.select().from(schema.issues).where(
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

    const [existing] = await db.select().from(schema.workflowRuns).where(eq(schema.workflowRuns.githubId, workflowRun.id))

    if (existing) {
      await db.update(schema.workflowRuns).set({
        issueId,
        status: workflowRun.status,
        conclusion: workflowRun.conclusion,
        completedAt: workflowRun.updated_at ? new Date(workflowRun.updated_at) : null,
        updatedAt: new Date()
      }).where(eq(schema.workflowRuns.id, existing.id))
    } else {
      await db.insert(schema.workflowRuns).values({
        githubId: workflowRun.id,
        repositoryId: dbRepoId,
        issueId,
        actorId,
        workflowId: workflowRun.workflow_id,
        workflowName: workflowRun.workflow?.name || workflowRun.name,
        name: workflowRun.name || workflowRun.display_title,
        headBranch: workflowRun.head_branch,
        headSha: workflowRun.head_sha,
        event: workflowRun.event,
        status: workflowRun.status,
        conclusion: workflowRun.conclusion,
        htmlUrl: workflowRun.html_url,
        runNumber: workflowRun.run_number,
        runAttempt: workflowRun.run_attempt,
        startedAt: workflowRun.run_started_at ? new Date(workflowRun.run_started_at) : null,
        completedAt: workflowRun.updated_at ? new Date(workflowRun.updated_at) : null
      })
    }
  }
}

export async function handleCheckRunEvent(action: string, checkRun: GitHubCheckRun, repository: GitHubRepository) {
  // Check if repository is synced (lookup by GitHub ID)
  const dbRepoId = await getDbRepositoryId(repository.id)
  if (!dbRepoId) {
    console.log(`[Webhook] Repository ${repository.full_name} not synced, skipping check run event`)
    return
  }

  // Handle created, completed, and rerequested actions
  if (action === 'created' || action === 'completed' || action === 'rerequested') {
    const checkData = {
      repositoryId: dbRepoId,
      headSha: checkRun.head_sha,
      name: checkRun.name,
      status: checkRun.status,
      conclusion: checkRun.conclusion,
      htmlUrl: checkRun.html_url,
      detailsUrl: checkRun.details_url,
      appSlug: checkRun.app?.slug || null,
      appName: checkRun.app?.name || null,
      startedAt: checkRun.started_at ? new Date(checkRun.started_at) : null,
      completedAt: checkRun.completed_at ? new Date(checkRun.completed_at) : null,
      updatedAt: new Date()
    }

    const [existing] = await db.select().from(schema.checkRuns).where(eq(schema.checkRuns.githubId, checkRun.id))

    if (existing) {
      await db.update(schema.checkRuns).set(checkData).where(eq(schema.checkRuns.id, existing.id))
    } else {
      await db.insert(schema.checkRuns).values({
        githubId: checkRun.id,
        ...checkData
      })
    }

    console.log(`[Webhook] Check run ${checkRun.name} ${action} for ${repository.full_name}`)
  }
}

// Commit Status state type (from GitHub Status API)
type CommitStatusState = 'error' | 'failure' | 'pending' | 'success'

// GitHub Status Event payload
interface GitHubStatusPayload {
  id: number
  sha: string
  state: CommitStatusState
  context: string
  description: string | null
  target_url: string | null
}

export async function handleStatusEvent(payload: GitHubStatusPayload, repository: GitHubRepository) {
  // Check if repository is synced (lookup by GitHub ID)
  const dbRepoId = await getDbRepositoryId(repository.id)
  if (!dbRepoId) {
    console.log(`[Webhook] Repository ${repository.full_name} not synced, skipping status event`)
    return
  }

  const statusData = {
    repositoryId: dbRepoId,
    sha: payload.sha,
    state: payload.state,
    context: payload.context,
    description: payload.description,
    targetUrl: payload.target_url,
    updatedAt: new Date()
  }

  const [existing] = await db.select().from(schema.commitStatuses).where(eq(schema.commitStatuses.githubId, payload.id))

  if (existing) {
    await db.update(schema.commitStatuses).set(statusData).where(eq(schema.commitStatuses.id, existing.id))
  } else {
    await db.insert(schema.commitStatuses).values({
      githubId: payload.id,
      ...statusData
    })
  }

  console.log(`[Webhook] Commit status ${payload.context}: ${payload.state} for ${repository.full_name}`)
}
