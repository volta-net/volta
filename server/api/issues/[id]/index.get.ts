import { eq, and } from 'drizzle-orm'
import { db, schema } from 'hub:db'
import { Octokit } from 'octokit'
import { ensureUser } from '../../../utils/users'
import { getDbLabelId } from '../../../utils/sync'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, message: 'Issue ID is required' })
  }

  const issueId = parseInt(id)
  if (isNaN(issueId)) {
    throw createError({ statusCode: 400, message: 'Invalid issue ID' })
  }

  // Fetch issue with relations
  const issue = await db.query.issues.findFirst({
    where: eq(schema.issues.id, issueId),
    with: {
      repository: true,
      milestone: true,
      user: true,
      closedBy: true,
      mergedBy: true,
      assignees: {
        with: {
          user: true
        }
      },
      labels: {
        with: {
          label: true
        }
      },
      requestedReviewers: {
        with: {
          user: true
        }
      },
      comments: {
        with: {
          user: true
        },
        orderBy: (comments, { asc }) => [asc(comments.createdAt)]
      },
      reviews: {
        with: {
          user: true
        },
        orderBy: (reviews, { asc }) => [asc(reviews.submittedAt)]
      },
      reviewComments: {
        with: {
          user: true,
          review: true
        },
        orderBy: (reviewComments, { asc }) => [asc(reviewComments.createdAt)]
      }
    }
  })

  if (!issue) {
    throw createError({ statusCode: 404, message: 'Issue not found' })
  }

  // Check user has access to this repository
  await requireRepositoryAccess(user.id, issue.repositoryId)

  // Get valid access token (refreshes if expired)
  const accessToken = await getValidAccessToken(event)

  // Mark related notification as read (if exists)
  await db
    .update(schema.notifications)
    .set({
      read: true,
      readAt: new Date()
    })
    .where(and(
      eq(schema.notifications.userId, user.id),
      eq(schema.notifications.issueId, issueId),
      eq(schema.notifications.read, false)
    ))

  // Check if user is subscribed to this issue
  const subscription = await db.query.issueSubscriptions.findFirst({
    where: and(
      eq(schema.issueSubscriptions.issueId, issueId),
      eq(schema.issueSubscriptions.userId, user.id)
    )
  })
  const isSubscribed = !!subscription

  // Re-sync in background if data is stale (for reactions, etc. that don't have webhooks)
  const STALE_THRESHOLD = 5 * 60 * 1000 // 5 minutes
  const isStale = issue.synced && issue.syncedAt && (Date.now() - new Date(issue.syncedAt).getTime() > STALE_THRESHOLD)

  if (isStale) {
    // Sync in background (don't await - return cached data immediately)
    syncIssueFromGitHub(accessToken, issue).catch((err) => {
      console.warn('[issues] Failed to re-sync stale issue from GitHub:', err)
    })
  }

  // If issue hasn't been fully synced yet (comments, reactions, etc.), await the sync
  if (!issue.synced) {
    try {
      await syncIssueFromGitHub(accessToken, issue)

      // Re-fetch issue with fresh data
      const freshIssue = await db.query.issues.findFirst({
        where: eq(schema.issues.id, issueId),
        with: {
          repository: true,
          milestone: true,
          user: true,
          closedBy: true,
          mergedBy: true,
          assignees: { with: { user: true } },
          labels: { with: { label: true } },
          requestedReviewers: { with: { user: true } },
          comments: {
            with: { user: true },
            orderBy: (comments, { asc }) => [asc(comments.createdAt)]
          },
          reviews: {
            with: { user: true },
            orderBy: (reviews, { asc }) => [asc(reviews.submittedAt)]
          },
          reviewComments: {
            with: { user: true, review: true },
            orderBy: (reviewComments, { asc }) => [asc(reviewComments.createdAt)]
          }
        }
      })

      return {
        ...freshIssue,
        assignees: freshIssue!.assignees.map(a => a.user),
        labels: freshIssue!.labels.map(l => l.label),
        requestedReviewers: freshIssue!.requestedReviewers.map(r => r.user),
        isSubscribed
      }
    } catch (err) {
      console.warn('[issues] Failed to sync issue from GitHub:', err)
      // Fall through to return cached data
    }
  }

  // Return cached data
  return {
    ...issue,
    assignees: issue.assignees.map(a => a.user),
    labels: issue.labels.map(l => l.label),
    requestedReviewers: issue.requestedReviewers.map(r => r.user),
    isSubscribed
  }
})

// Re-sync issue from GitHub to catch missed webhooks
async function syncIssueFromGitHub(accessToken: string, issue: any) {
  const octokit = new Octokit({ auth: accessToken })
  const [owner, repo] = issue.repository.fullName.split('/')

  // Fetch fresh issue data from GitHub
  const isPR = issue.pullRequest

  if (isPR) {
    const { data: ghPr } = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: issue.number
    })

    // Ensure author exists in database
    if (ghPr.user) {
      await ensureUser({
        id: ghPr.user.id,
        login: ghPr.user.login,
        avatar_url: ghPr.user.avatar_url
      })
    }

    // Ensure merged_by user exists and get internal ID
    let mergedById: number | null = null
    if (ghPr.merged_by) {
      mergedById = await ensureUser({
        id: ghPr.merged_by.id,
        login: ghPr.merged_by.login,
        avatar_url: ghPr.merged_by.avatar_url
      })
    }

    // Update issue data (skip reactionCount - not available in PR endpoint)
    await db.update(schema.issues).set({
      title: ghPr.title,
      body: ghPr.body,
      state: ghPr.state,
      locked: ghPr.locked,
      draft: ghPr.draft,
      merged: ghPr.merged_at !== null,
      commits: ghPr.commits,
      additions: ghPr.additions,
      deletions: ghPr.deletions,
      changedFiles: ghPr.changed_files,
      headRef: ghPr.head.ref,
      headSha: ghPr.head.sha,
      baseRef: ghPr.base.ref,
      baseSha: ghPr.base.sha,
      mergedAt: ghPr.merged_at ? new Date(ghPr.merged_at) : null,
      mergedById,
      closedAt: ghPr.closed_at ? new Date(ghPr.closed_at) : null,
      closedById: mergedById, // If merged, merged_by is the closer
      commentCount: ghPr.comments,
      updatedAt: new Date()
    }).where(eq(schema.issues.id, issue.id))

    // Sync assignees
    await syncAssignees(issue.id, ghPr.assignees || [])

    // Sync labels
    await syncLabels(issue.id, ghPr.labels.map(l => l.id))

    // Sync requested reviewers
    const reviewers = (ghPr.requested_reviewers as any[])?.filter(r => r.id) || []
    await syncRequestedReviewers(issue.id, reviewers)

    // Sync comments (general PR comments)
    await syncComments(accessToken, owner, repo, issue.number, issue.id)

    // Sync PR reviews and review comments
    await syncReviews(accessToken, owner, repo, issue.number, issue.id)
    await syncReviewComments(accessToken, owner, repo, issue.number, issue.id)

    // Mark as fully synced
    await db.update(schema.issues).set({ synced: true, syncedAt: new Date() }).where(eq(schema.issues.id, issue.id))
  } else {
    const { data: ghIssue } = await octokit.rest.issues.get({
      owner,
      repo,
      issue_number: issue.number
    })

    // Ensure author exists in database
    if (ghIssue.user) {
      await ensureUser({
        id: ghIssue.user.id,
        login: ghIssue.user.login,
        avatar_url: ghIssue.user.avatar_url
      })
    }

    // Ensure closed_by user exists and get internal ID
    let closedById: number | null = null
    if (ghIssue.closed_by) {
      closedById = await ensureUser({
        id: ghIssue.closed_by.id,
        login: ghIssue.closed_by.login,
        avatar_url: ghIssue.closed_by.avatar_url
      })
    }

    // Update issue data
    await db.update(schema.issues).set({
      title: ghIssue.title,
      body: ghIssue.body,
      state: ghIssue.state,
      stateReason: ghIssue.state_reason,
      locked: ghIssue.locked,
      closedAt: ghIssue.closed_at ? new Date(ghIssue.closed_at) : null,
      closedById,
      commentCount: ghIssue.comments,
      reactionCount: ghIssue.reactions?.total_count ?? 0,
      updatedAt: new Date()
    }).where(eq(schema.issues.id, issue.id))

    // Sync assignees
    await syncAssignees(issue.id, ghIssue.assignees || [])

    // Sync labels
    const labelGithubIds = ghIssue.labels
      .filter((l): l is { id: number } => typeof l === 'object' && 'id' in l)
      .map(l => l.id)
    await syncLabels(issue.id, labelGithubIds)

    // Sync comments
    await syncComments(accessToken, owner, repo, issue.number, issue.id)

    // Mark as fully synced
    await db.update(schema.issues).set({ synced: true, syncedAt: new Date() }).where(eq(schema.issues.id, issue.id))
  }
}

async function syncAssignees(issueId: number, assignees: { id: number, login: string, avatar_url: string }[]) {
  // Get existing assignees
  const existingAssignees = await db
    .select()
    .from(schema.issueAssignees)
    .where(eq(schema.issueAssignees.issueId, issueId))

  const existingDbIds = new Set(existingAssignees.map(a => a.userId))

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
    if (!existingDbIds.has(dbUserId)) {
      await db.insert(schema.issueAssignees)
        .values({ issueId, userId: dbUserId })
        .onConflictDoNothing()
    }
  }
}

async function syncLabels(issueId: number, labelGithubIds: number[]) {
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

  // Insert new labels
  for (const dbLabelId of newDbIds) {
    if (!existingDbIds.has(dbLabelId)) {
      try {
        await db.insert(schema.issueLabels)
          .values({ issueId, labelId: dbLabelId })
          .onConflictDoNothing()
      } catch {
        // Label may not exist in our DB
      }
    }
  }
}

async function syncRequestedReviewers(issueId: number, reviewers: { id: number, login: string, avatar_url?: string }[]) {
  // Get existing reviewers
  const existingReviewers = await db
    .select()
    .from(schema.issueRequestedReviewers)
    .where(eq(schema.issueRequestedReviewers.issueId, issueId))

  const existingDbIds = new Set(existingReviewers.map(r => r.userId))

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
    if (!existingDbIds.has(dbUserId)) {
      await db.insert(schema.issueRequestedReviewers)
        .values({ issueId, userId: dbUserId })
        .onConflictDoNothing()
    }
  }
}

async function syncComments(accessToken: string, owner: string, repo: string, issueNumber: number, issueId: number) {
  const octokit = new Octokit({ auth: accessToken })

  const { data: comments } = await octokit.rest.issues.listComments({
    owner,
    repo,
    issue_number: issueNumber,
    per_page: 100
  })

  // Upsert comments
  for (const comment of comments) {
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
      updatedAt: new Date(comment.updated_at)
    }

    // Look up by GitHub ID
    const existing = await db.query.issueComments.findFirst({
      where: eq(schema.issueComments.githubId, comment.id)
    })

    if (existing) {
      await db.update(schema.issueComments).set(commentData).where(eq(schema.issueComments.id, existing.id))
    } else {
      await db.insert(schema.issueComments).values({
        githubId: comment.id,
        ...commentData,
        createdAt: new Date(comment.created_at)
      })
    }
  }
}

async function syncReviews(accessToken: string, owner: string, repo: string, prNumber: number, issueId: number) {
  const octokit = new Octokit({ auth: accessToken })

  const { data: reviews } = await octokit.rest.pulls.listReviews({
    owner,
    repo,
    pull_number: prNumber,
    per_page: 100
  })

  // Upsert reviews
  for (const review of reviews) {
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
      state: review.state as any,
      htmlUrl: review.html_url,
      commitId: review.commit_id,
      submittedAt: review.submitted_at ? new Date(review.submitted_at) : null
    }

    // Look up by GitHub ID
    const existing = await db.query.issueReviews.findFirst({
      where: eq(schema.issueReviews.githubId, review.id)
    })

    if (existing) {
      await db.update(schema.issueReviews).set(reviewData).where(eq(schema.issueReviews.id, existing.id))
    } else {
      await db.insert(schema.issueReviews).values({
        githubId: review.id,
        ...reviewData
      })
    }
  }
}

async function syncReviewComments(accessToken: string, owner: string, repo: string, prNumber: number, issueId: number) {
  const octokit = new Octokit({ auth: accessToken })

  const { data: comments } = await octokit.rest.pulls.listReviewComments({
    owner,
    repo,
    pull_number: prNumber,
    per_page: 100
  })

  // Upsert review comments
  for (const comment of comments) {
    let userId: number | null = null
    if (comment.user) {
      userId = await ensureUser({
        id: comment.user.id,
        login: comment.user.login,
        avatar_url: comment.user.avatar_url
      })
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
      updatedAt: new Date(comment.updated_at)
    }

    // Look up by GitHub ID
    const existing = await db.query.issueReviewComments.findFirst({
      where: eq(schema.issueReviewComments.githubId, comment.id)
    })

    if (existing) {
      await db.update(schema.issueReviewComments).set(commentData).where(eq(schema.issueReviewComments.id, existing.id))
    } else {
      await db.insert(schema.issueReviewComments).values({
        githubId: comment.id,
        ...commentData,
        createdAt: new Date(comment.created_at)
      })
    }
  }
}
