import { eq, and } from 'drizzle-orm'
import { db, schema } from 'hub:db'
import { ensureUser } from './users'
import { subscribeUserToIssue } from './sync'

// ============================================================================
// Issues
// ============================================================================

export async function handleIssueEvent(action: string, issue: any, repository: any, installationId?: number) {
  // Check if repository is synced
  const [repo] = await db.select().from(schema.repositories).where(eq(schema.repositories.id, repository.id))
  if (!repo) {
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
      await upsertIssue(issue, repository.id, repository.full_name, 'issue', installationId)
      break
    case 'deleted':
    case 'transferred':
      await db.delete(schema.issues).where(eq(schema.issues.id, issue.id))
      break
  }
}

// ============================================================================
// Pull Requests
// ============================================================================

export async function handlePullRequestEvent(action: string, pullRequest: any, repository: any, installationId?: number) {
  // Check if repository is synced
  const [repo] = await db.select().from(schema.repositories).where(eq(schema.repositories.id, repository.id))
  if (!repo) {
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
    case 'synchronize':
      await upsertIssue(pullRequest, repository.id, repository.full_name, 'pull_request', installationId)
      break
  }
}

// ============================================================================
// Issues (Issues & Pull Requests unified)
// ============================================================================

async function upsertIssue(item: any, repositoryId: number, repositoryFullName: string, type: 'issue' | 'pull_request', installationId?: number) {
  // Ensure author exists as shadow user
  if (item.user) {
    await ensureUser({
      id: item.user.id,
      login: item.user.login,
      avatar_url: item.user.avatar_url
    })
  }

  const itemData: any = {
    type,
    repositoryId,
    milestoneId: item.milestone?.id ?? null,
    userId: item.user?.id,
    number: item.number,
    title: item.title,
    body: item.body,
    state: item.state,
    htmlUrl: item.html_url,
    locked: item.locked,
    closedAt: item.closed_at ? new Date(item.closed_at) : null,
    updatedAt: new Date()
  }

  // Issue-specific fields
  if (type === 'issue') {
    itemData.stateReason = item.state_reason
  }

  // PR-specific fields
  if (type === 'pull_request') {
    itemData.draft = item.draft
    itemData.merged = item.merged_at !== null || item.merged === true
    itemData.commits = item.commits
    itemData.additions = item.additions
    itemData.deletions = item.deletions
    itemData.changedFiles = item.changed_files
    itemData.headRef = item.head?.ref
    itemData.headSha = item.head?.sha
    itemData.baseRef = item.base?.ref
    itemData.baseSha = item.base?.sha
    itemData.mergedAt = item.merged_at ? new Date(item.merged_at) : null
  }

  const [existing] = await db.select().from(schema.issues).where(eq(schema.issues.id, item.id))

  if (existing) {
    await db.update(schema.issues).set(itemData).where(eq(schema.issues.id, item.id))
  } else {
    await db.insert(schema.issues).values({
      id: item.id,
      ...itemData
    })

    // Subscribe author to the new issue/PR
    if (item.user?.id) {
      await subscribeUserToIssue(item.id, item.user.id)
    }
  }

  // Sync assignees
  await syncIssueAssignees(item.id, item.assignees || [])

  // Sync labels
  const labelIds = item.labels?.map((l: any) => l.id).filter(Boolean) || []
  await syncIssueLabels(item.id, labelIds)

  // Sync requested reviewers (PRs only)
  if (type === 'pull_request') {
    const reviewers = item.requested_reviewers?.filter((r: any) => r.id) || []
    await syncIssueRequestedReviewers(item.id, reviewers)
  }

  // If issue/PR hasn't been fully synced yet, sync comments (and reviews for PRs)
  if (installationId && !existing?.synced) {
    await syncAllComments(installationId, repositoryFullName, item.number, item.id)
    if (type === 'pull_request') {
      await syncAllReviews(installationId, repositoryFullName, item.number, item.id)
    }
    await db.update(schema.issues).set({ synced: true }).where(eq(schema.issues.id, item.id))
  }
}

// Helper: sync issue assignees
async function syncIssueAssignees(issueId: number, assignees: { id: number, login: string, avatar_url: string }[]) {
  const newAssigneeIds = new Set(assignees.map(a => a.id))

  // Get existing assignees
  const existingAssignees = await db
    .select()
    .from(schema.issueAssignees)
    .where(eq(schema.issueAssignees.issueId, issueId))

  const existingIds = new Set(existingAssignees.map(a => a.userId))

  // Delete removed assignees
  for (const existing of existingAssignees) {
    if (!newAssigneeIds.has(existing.userId)) {
      await db.delete(schema.issueAssignees).where(
        and(
          eq(schema.issueAssignees.issueId, issueId),
          eq(schema.issueAssignees.userId, existing.userId)
        )
      )
    }
  }

  // Insert new assignees
  for (const assignee of assignees) {
    if (!existingIds.has(assignee.id)) {
      await ensureUser({
        id: assignee.id,
        login: assignee.login,
        avatar_url: assignee.avatar_url
      })
      await db.insert(schema.issueAssignees).values({
        issueId,
        userId: assignee.id
      })
    }

    // Auto-subscribe assignee to the issue
    await subscribeUserToIssue(issueId, assignee.id)
  }
}

// Helper: sync issue labels
async function syncIssueLabels(issueId: number, labelIds: number[]) {
  const newLabelIds = new Set(labelIds)

  // Get existing labels
  const existingLabels = await db
    .select()
    .from(schema.issueLabels)
    .where(eq(schema.issueLabels.issueId, issueId))

  const existingIds = new Set(existingLabels.map(l => l.labelId))

  // Delete removed labels
  for (const existing of existingLabels) {
    if (!newLabelIds.has(existing.labelId)) {
      await db.delete(schema.issueLabels).where(
        and(
          eq(schema.issueLabels.issueId, issueId),
          eq(schema.issueLabels.labelId, existing.labelId)
        )
      )
    }
  }

  // Insert new labels (only if label exists in our DB)
  for (const labelId of labelIds) {
    if (!existingIds.has(labelId)) {
      try {
        await db.insert(schema.issueLabels).values({
          issueId,
          labelId
        })
      } catch {
        // Label may not exist in our DB yet - skip
      }
    }
  }
}

// Helper: sync issue requested reviewers
async function syncIssueRequestedReviewers(issueId: number, reviewers: { id: number, login: string, avatar_url?: string }[]) {
  const newReviewerIds = new Set(reviewers.map(r => r.id))

  // Get existing reviewers
  const existingReviewers = await db
    .select()
    .from(schema.issueRequestedReviewers)
    .where(eq(schema.issueRequestedReviewers.issueId, issueId))

  const existingIds = new Set(existingReviewers.map(r => r.userId))

  // Delete removed reviewers
  for (const existing of existingReviewers) {
    if (!newReviewerIds.has(existing.userId)) {
      await db.delete(schema.issueRequestedReviewers).where(
        and(
          eq(schema.issueRequestedReviewers.issueId, issueId),
          eq(schema.issueRequestedReviewers.userId, existing.userId)
        )
      )
    }
  }

  // Insert new reviewers
  for (const reviewer of reviewers) {
    if (!existingIds.has(reviewer.id)) {
      await ensureUser({
        id: reviewer.id,
        login: reviewer.login,
        avatar_url: reviewer.avatar_url
      })
      await db.insert(schema.issueRequestedReviewers).values({
        issueId,
        userId: reviewer.id
      })
    }

    // Auto-subscribe reviewer to the PR
    await subscribeUserToIssue(issueId, reviewer.id)
  }
}

// ============================================================================
// Comments
// ============================================================================

export async function handleCommentEvent(action: string, comment: any, issue: any, repository: any, installationId?: number) {
  // Check if repository is synced
  const [repo] = await db.select().from(schema.repositories).where(eq(schema.repositories.id, repository.id))
  if (!repo) {
    console.log(`[Webhook] Repository ${repository.full_name} not synced, skipping comment event`)
    return
  }

  // Check if the issue exists in our DB
  const [existingIssue] = await db.select().from(schema.issues).where(eq(schema.issues.id, issue.id))
  if (!existingIssue) {
    console.log(`[Webhook] Issue ${issue.id} not synced, skipping comment event`)
    return
  }

  // If issue hasn't been fully synced yet, fetch all comments (and reviews for PRs) now
  if (!existingIssue.synced && installationId) {
    await syncAllComments(installationId, repository.full_name, issue.number, existingIssue.id)
    // Also sync reviews if this is a PR
    if (existingIssue.type === 'pull_request') {
      await syncAllReviews(installationId, repository.full_name, issue.number, existingIssue.id)
    }
    // Mark issue as synced
    await db.update(schema.issues).set({ synced: true }).where(eq(schema.issues.id, existingIssue.id))
    return // All comments including this one are now synced
  }

  // Issue already synced, just upsert this single comment
  switch (action) {
    case 'created':
      await upsertComment(comment, existingIssue.id)
      // Subscribe commenter to the issue
      if (comment.user?.id) {
        await subscribeUserToIssue(existingIssue.id, comment.user.id)
      }
      break
    case 'edited':
      await upsertComment(comment, existingIssue.id)
      break
    case 'deleted':
      await db.delete(schema.issueComments).where(eq(schema.issueComments.id, comment.id))
      break
  }
}

// Fetch all comments for an issue using installation token
async function syncAllComments(installationId: number, repoFullName: string, issueNumber: number, issueId: number) {
  try {
    const octokit = await useOctokitAsInstallation(installationId)
    const [owner, repo] = repoFullName.split('/')

    const comments = await octokit.paginate(octokit.rest.issues.listComments, {
      owner,
      repo,
      issue_number: issueNumber,
      per_page: 100
    })

    // Upsert comments
    for (const comment of comments) {
      if (comment.user) {
        await ensureUser({
          id: comment.user.id,
          login: comment.user.login,
          avatar_url: comment.user.avatar_url
        })

        // Subscribe commenter to the issue
        await subscribeUserToIssue(issueId, comment.user.id)
      }

      const commentData = {
        issueId,
        userId: comment.user?.id,
        body: comment.body || '',
        htmlUrl: comment.html_url,
        updatedAt: new Date(comment.updated_at)
      }

      const [existing] = await db.select().from(schema.issueComments).where(eq(schema.issueComments.id, comment.id))

      if (existing) {
        await db.update(schema.issueComments).set(commentData).where(eq(schema.issueComments.id, comment.id))
      } else {
        await db.insert(schema.issueComments).values({
          id: comment.id,
          ...commentData,
          createdAt: new Date(comment.created_at)
        })
      }
    }

    console.log(`[Webhook] Synced ${comments.length} comments for issue #${issueNumber}`)
  } catch (error) {
    console.error(`[Webhook] Failed to sync comments for issue #${issueNumber}:`, error)
  }
}

async function upsertComment(comment: any, issueId: number) {
  // Ensure author exists as shadow user
  if (comment.user) {
    await ensureUser({
      id: comment.user.id,
      login: comment.user.login,
      avatar_url: comment.user.avatar_url
    })
  }

  const commentData = {
    issueId,
    userId: comment.user?.id,
    body: comment.body || '',
    htmlUrl: comment.html_url,
    updatedAt: new Date(comment.updated_at)
  }

  const [existing] = await db.select().from(schema.issueComments).where(eq(schema.issueComments.id, comment.id))

  if (existing) {
    await db.update(schema.issueComments).set(commentData).where(eq(schema.issueComments.id, comment.id))
  } else {
    await db.insert(schema.issueComments).values({
      id: comment.id,
      ...commentData,
      createdAt: new Date(comment.created_at)
    })
  }
}

// ============================================================================
// PR Reviews
// ============================================================================

export async function handleReviewEvent(action: string, review: any, pullRequest: any, repository: any, installationId?: number) {
  // Check if repository is synced
  const [repo] = await db.select().from(schema.repositories).where(eq(schema.repositories.id, repository.id))
  if (!repo) {
    console.log(`[Webhook] Repository ${repository.full_name} not synced, skipping review event`)
    return
  }

  // Check if the PR exists in our DB
  const [existingPR] = await db.select().from(schema.issues).where(eq(schema.issues.id, pullRequest.id))
  if (!existingPR) {
    console.log(`[Webhook] PR ${pullRequest.id} not synced, skipping review event`)
    return
  }

  // If PR hasn't been fully synced yet, fetch all comments and reviews
  if (!existingPR.synced && installationId) {
    await syncAllComments(installationId, repository.full_name, pullRequest.number, existingPR.id)
    await syncAllReviews(installationId, repository.full_name, pullRequest.number, existingPR.id)
    // Mark PR as synced
    await db.update(schema.issues).set({ synced: true }).where(eq(schema.issues.id, existingPR.id))
    return
  }

  switch (action) {
    case 'submitted':
      await upsertReview(review, existingPR.id)
      // Subscribe reviewer to the PR
      if (review.user?.id) {
        await subscribeUserToIssue(existingPR.id, review.user.id)
      }
      break
    case 'edited':
      await upsertReview(review, existingPR.id)
      break
    case 'dismissed':
      await db.update(schema.issueReviews).set({
        state: 'DISMISSED',
        updatedAt: new Date()
      }).where(eq(schema.issueReviews.id, review.id))
      break
  }
}

async function upsertReview(review: any, issueId: number) {
  if (review.user) {
    await ensureUser({
      id: review.user.id,
      login: review.user.login,
      avatar_url: review.user.avatar_url
    })
  }

  const reviewData = {
    issueId,
    userId: review.user?.id,
    body: review.body,
    state: review.state as any,
    htmlUrl: review.html_url,
    commitId: review.commit_id,
    submittedAt: review.submitted_at ? new Date(review.submitted_at) : null,
    updatedAt: new Date()
  }

  const [existing] = await db.select().from(schema.issueReviews).where(eq(schema.issueReviews.id, review.id))

  if (existing) {
    await db.update(schema.issueReviews).set(reviewData).where(eq(schema.issueReviews.id, review.id))
  } else {
    await db.insert(schema.issueReviews).values({
      id: review.id,
      ...reviewData
    })
  }
}

async function syncAllReviews(installationId: number, repoFullName: string, prNumber: number, issueId: number) {
  try {
    const octokit = await useOctokitAsInstallation(installationId)
    const [owner, repo] = repoFullName.split('/')

    // Sync reviews
    const reviews = await octokit.paginate(octokit.rest.pulls.listReviews, {
      owner,
      repo,
      pull_number: prNumber,
      per_page: 100
    })

    for (const review of reviews) {
      if (review.user) {
        await ensureUser({
          id: review.user.id,
          login: review.user.login,
          avatar_url: review.user.avatar_url
        })

        // Subscribe reviewer to the PR
        await subscribeUserToIssue(issueId, review.user.id)
      }

      const reviewData = {
        issueId,
        userId: review.user?.id,
        body: review.body,
        state: review.state as any,
        htmlUrl: review.html_url,
        commitId: review.commit_id,
        submittedAt: review.submitted_at ? new Date(review.submitted_at) : null
      }

      const [existing] = await db.select().from(schema.issueReviews).where(eq(schema.issueReviews.id, review.id))

      if (existing) {
        await db.update(schema.issueReviews).set(reviewData).where(eq(schema.issueReviews.id, review.id))
      } else {
        await db.insert(schema.issueReviews).values({
          id: review.id,
          ...reviewData
        })
      }
    }

    // Sync review comments
    const reviewComments = await octokit.paginate(octokit.rest.pulls.listReviewComments, {
      owner,
      repo,
      pull_number: prNumber,
      per_page: 100
    })

    for (const comment of reviewComments) {
      if (comment.user) {
        await ensureUser({
          id: comment.user.id,
          login: comment.user.login,
          avatar_url: comment.user.avatar_url
        })
      }

      const commentData = {
        issueId,
        reviewId: comment.pull_request_review_id,
        userId: comment.user?.id,
        body: comment.body,
        path: comment.path,
        line: comment.line,
        side: comment.side,
        commitId: comment.commit_id,
        diffHunk: comment.diff_hunk,
        htmlUrl: comment.html_url,
        updatedAt: new Date(comment.updated_at)
      }

      const [existing] = await db.select().from(schema.issueReviewComments).where(eq(schema.issueReviewComments.id, comment.id))

      if (existing) {
        await db.update(schema.issueReviewComments).set(commentData).where(eq(schema.issueReviewComments.id, comment.id))
      } else {
        await db.insert(schema.issueReviewComments).values({
          id: comment.id,
          ...commentData,
          createdAt: new Date(comment.created_at)
        })
      }
    }

    console.log(`[Webhook] Synced ${reviews.length} reviews and ${reviewComments.length} review comments for PR #${prNumber}`)
  } catch (error) {
    console.error(`[Webhook] Failed to sync reviews for PR #${prNumber}:`, error)
  }
}

// ============================================================================
// PR Review Comments
// ============================================================================

export async function handleReviewCommentEvent(action: string, comment: any, pullRequest: any, repository: any, installationId?: number) {
  // Check if repository is synced
  const [repo] = await db.select().from(schema.repositories).where(eq(schema.repositories.id, repository.id))
  if (!repo) {
    console.log(`[Webhook] Repository ${repository.full_name} not synced, skipping review comment event`)
    return
  }

  // Check if the PR exists in our DB
  const [existingPR] = await db.select().from(schema.issues).where(eq(schema.issues.id, pullRequest.id))
  if (!existingPR) {
    console.log(`[Webhook] PR ${pullRequest.id} not synced, skipping review comment event`)
    return
  }

  // If PR hasn't been fully synced, sync all comments and reviews
  if (!existingPR.synced && installationId) {
    await syncAllComments(installationId, repository.full_name, pullRequest.number, existingPR.id)
    await syncAllReviews(installationId, repository.full_name, pullRequest.number, existingPR.id)
    await db.update(schema.issues).set({ synced: true }).where(eq(schema.issues.id, existingPR.id))
    return
  }

  switch (action) {
    case 'created':
    case 'edited':
      await upsertReviewComment(comment, existingPR.id)
      break
    case 'deleted':
      await db.delete(schema.issueReviewComments).where(eq(schema.issueReviewComments.id, comment.id))
      break
  }
}

async function upsertReviewComment(comment: any, issueId: number) {
  if (comment.user) {
    await ensureUser({
      id: comment.user.id,
      login: comment.user.login,
      avatar_url: comment.user.avatar_url
    })
  }

  const commentData = {
    issueId,
    reviewId: comment.pull_request_review_id,
    userId: comment.user?.id,
    body: comment.body,
    path: comment.path,
    line: comment.line,
    side: comment.side,
    commitId: comment.commit_id,
    diffHunk: comment.diff_hunk,
    htmlUrl: comment.html_url,
    updatedAt: new Date(comment.updated_at)
  }

  const [existing] = await db.select().from(schema.issueReviewComments).where(eq(schema.issueReviewComments.id, comment.id))

  if (existing) {
    await db.update(schema.issueReviewComments).set(commentData).where(eq(schema.issueReviewComments.id, comment.id))
  } else {
    await db.insert(schema.issueReviewComments).values({
      id: comment.id,
      ...commentData,
      createdAt: new Date(comment.created_at)
    })
  }
}

// ============================================================================
// Labels
// ============================================================================

export async function handleLabelEvent(action: string, label: any, repository: any) {
  // Check if repository is synced
  const [repo] = await db.select().from(schema.repositories).where(eq(schema.repositories.id, repository.id))
  if (!repo) {
    console.log(`[Webhook] Repository ${repository.full_name} not synced, skipping label event`)
    return
  }

  switch (action) {
    case 'created':
    case 'edited':
      await upsertLabel(label, repository.id)
      break
    case 'deleted':
      await db.delete(schema.labels).where(eq(schema.labels.id, label.id))
      break
  }
}

async function upsertLabel(label: any, repositoryId: number) {
  const labelData = {
    repositoryId,
    name: label.name,
    color: label.color,
    description: label.description,
    default: label.default,
    updatedAt: new Date()
  }

  const [existing] = await db.select().from(schema.labels).where(eq(schema.labels.id, label.id))

  if (existing) {
    await db.update(schema.labels).set(labelData).where(eq(schema.labels.id, label.id))
  } else {
    await db.insert(schema.labels).values({
      id: label.id,
      ...labelData
    })
  }
}

// ============================================================================
// Milestones
// ============================================================================

export async function handleMilestoneEvent(action: string, milestone: any, repository: any) {
  // Check if repository is synced
  const [repo] = await db.select().from(schema.repositories).where(eq(schema.repositories.id, repository.id))
  if (!repo) {
    console.log(`[Webhook] Repository ${repository.full_name} not synced, skipping milestone event`)
    return
  }

  switch (action) {
    case 'created':
    case 'edited':
    case 'opened':
    case 'closed':
      await upsertMilestone(milestone, repository.id)
      break
    case 'deleted':
      await db.delete(schema.milestones).where(eq(schema.milestones.id, milestone.id))
      break
  }
}

async function upsertMilestone(milestone: any, repositoryId: number) {
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

  const [existing] = await db.select().from(schema.milestones).where(eq(schema.milestones.id, milestone.id))

  if (existing) {
    await db.update(schema.milestones).set(milestoneData).where(eq(schema.milestones.id, milestone.id))
  } else {
    await db.insert(schema.milestones).values({
      id: milestone.id,
      ...milestoneData
    })
  }
}

// ============================================================================
// Repositories
// ============================================================================

export async function handleRepositoryEvent(action: string, repository: any) {
  switch (action) {
    case 'edited':
    case 'renamed':
      await updateRepository(repository)
      break
    case 'archived':
    case 'unarchived':
      await db.update(schema.repositories).set({
        archived: repository.archived,
        updatedAt: new Date()
      }).where(eq(schema.repositories.id, repository.id))
      break
    case 'deleted':
      // Cascade will handle related data
      await db.delete(schema.repositories).where(eq(schema.repositories.id, repository.id))
      break
    case 'privatized':
    case 'publicized':
      await db.update(schema.repositories).set({
        private: repository.private,
        updatedAt: new Date()
      }).where(eq(schema.repositories.id, repository.id))
      break
  }
}

async function updateRepository(repository: any) {
  const [existing] = await db.select().from(schema.repositories).where(eq(schema.repositories.id, repository.id))

  if (existing) {
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
    }).where(eq(schema.repositories.id, repository.id))
  }
}

// ============================================================================
// Installations
// ============================================================================

export async function handleInstallationEvent(action: string, installation: any, repositories?: any[]) {
  switch (action) {
    case 'created':
      await createInstallation(installation, repositories || [])
      break
    case 'deleted':
      // Cascade will handle related data
      await db.delete(schema.installations).where(eq(schema.installations.id, installation.id))
      break
    case 'suspend':
      await db.update(schema.installations).set({
        suspended: true,
        updatedAt: new Date()
      }).where(eq(schema.installations.id, installation.id))
      break
    case 'unsuspend':
      await db.update(schema.installations).set({
        suspended: false,
        updatedAt: new Date()
      }).where(eq(schema.installations.id, installation.id))
      break
    case 'new_permissions_accepted':
      // Just log for now
      console.log(`[Webhook] Installation ${installation.id} accepted new permissions`)
      break
  }
}

async function createInstallation(installation: any, repositories: any[]) {
  const account = installation.account

  // Check if installation exists
  const [existing] = await db.select().from(schema.installations).where(eq(schema.installations.id, installation.id))

  if (existing) {
    await db.update(schema.installations).set({
      accountLogin: account.login,
      avatarUrl: account.avatar_url,
      suspended: false,
      updatedAt: new Date()
    }).where(eq(schema.installations.id, installation.id))
  } else {
    await db.insert(schema.installations).values({
      id: installation.id,
      accountId: account.id,
      accountLogin: account.login,
      accountType: account.type,
      avatarUrl: account.avatar_url
    })
  }

  // Create repositories
  for (const repo of repositories) {
    const [existingRepo] = await db.select().from(schema.repositories).where(eq(schema.repositories.id, repo.id))
    if (!existingRepo) {
      await db.insert(schema.repositories).values({
        id: repo.id,
        installationId: installation.id,
        name: repo.name,
        fullName: repo.full_name,
        private: repo.private,
        description: repo.description,
        htmlUrl: repo.html_url,
        defaultBranch: repo.default_branch
      })
    }
  }
}

export async function handleInstallationRepositoriesEvent(action: string, installation: any, repositoriesAdded?: any[], repositoriesRemoved?: any[]) {
  switch (action) {
    case 'added':
      for (const repo of repositoriesAdded || []) {
        const [existing] = await db.select().from(schema.repositories).where(eq(schema.repositories.id, repo.id))
        if (!existing) {
          await db.insert(schema.repositories).values({
            id: repo.id,
            installationId: installation.id,
            name: repo.name,
            fullName: repo.full_name,
            private: repo.private
          })
        }
      }
      break
    case 'removed':
      for (const repo of repositoriesRemoved || []) {
        await db.delete(schema.repositories).where(eq(schema.repositories.id, repo.id))
      }
      break
  }
}

// ============================================================================
// Releases
// ============================================================================

export async function handleReleaseEvent(action: string, release: any, repository: any) {
  // Check if repository is synced
  const [repo] = await db.select().from(schema.repositories).where(eq(schema.repositories.id, repository.id))
  if (!repo) {
    console.log(`[Webhook] Repository ${repository.full_name} not synced, skipping release event`)
    return
  }

  if (action === 'published') {
    // Ensure author exists as shadow user
    if (release.author) {
      await ensureUser({
        id: release.author.id,
        login: release.author.login,
        avatar_url: release.author.avatar_url
      })
    }

    const [existing] = await db.select().from(schema.releases).where(eq(schema.releases.id, release.id))

    if (existing) {
      await db.update(schema.releases).set({
        tagName: release.tag_name,
        name: release.name,
        body: release.body,
        draft: release.draft,
        prerelease: release.prerelease,
        htmlUrl: release.html_url,
        publishedAt: release.published_at ? new Date(release.published_at) : null
      }).where(eq(schema.releases.id, release.id))
    } else {
      await db.insert(schema.releases).values({
        id: release.id,
        repositoryId: repository.id,
        authorId: release.author?.id,
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
    await db.delete(schema.releases).where(eq(schema.releases.id, release.id))
  }
}

// ============================================================================
// Workflow Runs
// ============================================================================

export async function handleWorkflowRunEvent(action: string, workflowRun: any, repository: any) {
  // Check if repository is synced
  const [repo] = await db.select().from(schema.repositories).where(eq(schema.repositories.id, repository.id))
  if (!repo) {
    console.log(`[Webhook] Repository ${repository.full_name} not synced, skipping workflow run event`)
    return
  }

  if (action === 'completed') {
    // Ensure actor exists as shadow user
    if (workflowRun.actor) {
      await ensureUser({
        id: workflowRun.actor.id,
        login: workflowRun.actor.login,
        avatar_url: workflowRun.actor.avatar_url
      })
    }

    const [existing] = await db.select().from(schema.workflowRuns).where(eq(schema.workflowRuns.id, workflowRun.id))

    if (existing) {
      await db.update(schema.workflowRuns).set({
        status: workflowRun.status,
        conclusion: workflowRun.conclusion,
        completedAt: workflowRun.updated_at ? new Date(workflowRun.updated_at) : null,
        updatedAt: new Date()
      }).where(eq(schema.workflowRuns.id, workflowRun.id))
    } else {
      await db.insert(schema.workflowRuns).values({
        id: workflowRun.id,
        repositoryId: repository.id,
        actorId: workflowRun.actor?.id,
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
