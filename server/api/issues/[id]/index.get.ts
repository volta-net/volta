import { eq, and } from 'drizzle-orm'
import { db, schema } from 'hub:db'
import { Octokit } from 'octokit'
import { ensureUser } from '~~/server/utils/users'

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

  // Get valid access token (refreshes if expired)
  const accessToken = await getValidAccessToken(event)

  // Verify user has access to the repository on GitHub
  const octokit = new Octokit({ auth: accessToken })
  const [owner, repo] = issue.repository!.fullName.split('/')
  try {
    await octokit.rest.repos.get({ owner, repo })
  } catch {
    throw createError({ statusCode: 403, message: 'You do not have access to this issue' })
  }

  // Mark related notification as read (if exists)
  await db
    .update(schema.notifications)
    .set({
      read: true,
      readAt: new Date()
    })
    .where(and(
      eq(schema.notifications.userId, user!.id),
      eq(schema.notifications.issueId, issueId),
      eq(schema.notifications.read, false)
    ))

  // Always sync in background for freshness
  syncIssueFromGitHub(accessToken, issue).catch((err) => {
    console.warn('[issues] Failed to re-sync issue from GitHub:', err)
  })

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
        requestedReviewers: freshIssue!.requestedReviewers.map(r => r.user)
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
    requestedReviewers: issue.requestedReviewers.map(r => r.user)
  }
})

// Re-sync issue from GitHub to catch missed webhooks
async function syncIssueFromGitHub(accessToken: string, issue: any) {
  const octokit = new Octokit({ auth: accessToken })
  const [owner, repo] = issue.repository.fullName.split('/')

  // Fetch fresh issue data from GitHub
  const isPR = issue.type === 'pull_request'

  if (isPR) {
    const { data: ghPr } = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: issue.number
    })

    // Ensure author exists
    if (ghPr.user) {
      await ensureUser({
        id: ghPr.user.id,
        login: ghPr.user.login,
        avatar_url: ghPr.user.avatar_url
      })
    }

    // Update issue data
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
      closedAt: ghPr.closed_at ? new Date(ghPr.closed_at) : null,
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
    await db.update(schema.issues).set({ synced: true }).where(eq(schema.issues.id, issue.id))
  } else {
    const { data: ghIssue } = await octokit.rest.issues.get({
      owner,
      repo,
      issue_number: issue.number
    })

    // Ensure author exists
    if (ghIssue.user) {
      await ensureUser({
        id: ghIssue.user.id,
        login: ghIssue.user.login,
        avatar_url: ghIssue.user.avatar_url
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
      updatedAt: new Date()
    }).where(eq(schema.issues.id, issue.id))

    // Sync assignees
    await syncAssignees(issue.id, ghIssue.assignees || [])

    // Sync labels
    const labelIds = ghIssue.labels
      .filter((l): l is { id: number } => typeof l === 'object' && 'id' in l)
      .map(l => l.id)
    await syncLabels(issue.id, labelIds)

    // Sync comments
    await syncComments(accessToken, owner, repo, issue.number, issue.id)

    // Mark as fully synced
    await db.update(schema.issues).set({ synced: true }).where(eq(schema.issues.id, issue.id))
  }
}

async function syncAssignees(issueId: number, assignees: { id: number, login: string, avatar_url: string }[]) {
  await db.delete(schema.issueAssignees).where(eq(schema.issueAssignees.issueId, issueId))

  for (const assignee of assignees) {
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
}

async function syncLabels(issueId: number, labelIds: number[]) {
  await db.delete(schema.issueLabels).where(eq(schema.issueLabels.issueId, issueId))

  for (const labelId of labelIds) {
    try {
      await db.insert(schema.issueLabels).values({
        issueId,
        labelId
      })
    } catch {
      // Label may not exist in our DB
    }
  }
}

async function syncRequestedReviewers(issueId: number, reviewers: { id: number, login: string, avatar_url?: string }[]) {
  await db.delete(schema.issueRequestedReviewers).where(eq(schema.issueRequestedReviewers.issueId, issueId))

  for (const reviewer of reviewers) {
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
}

async function syncComments(accessToken: string, owner: string, repo: string, issueNumber: number, issueId: number) {
  const octokit = new Octokit({ auth: accessToken })

  const { data: comments } = await octokit.rest.issues.listComments({
    owner,
    repo,
    issue_number: issueNumber,
    per_page: 100
  })

  // Delete existing comments and re-insert
  await db.delete(schema.issueComments).where(eq(schema.issueComments.issueId, issueId))

  for (const comment of comments) {
    if (comment.user) {
      await ensureUser({
        id: comment.user.id,
        login: comment.user.login,
        avatar_url: comment.user.avatar_url
      })
    }

    await db.insert(schema.issueComments).values({
      id: comment.id,
      issueId,
      userId: comment.user?.id,
      body: comment.body || '',
      htmlUrl: comment.html_url,
      createdAt: new Date(comment.created_at),
      updatedAt: new Date(comment.updated_at)
    })
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

  // Delete existing reviews and re-insert
  await db.delete(schema.issueReviews).where(eq(schema.issueReviews.issueId, issueId))

  for (const review of reviews) {
    if (review.user) {
      await ensureUser({
        id: review.user.id,
        login: review.user.login,
        avatar_url: review.user.avatar_url
      })
    }

    await db.insert(schema.issueReviews).values({
      id: review.id,
      issueId,
      userId: review.user?.id,
      body: review.body,
      state: review.state as any,
      htmlUrl: review.html_url,
      commitId: review.commit_id,
      submittedAt: review.submitted_at ? new Date(review.submitted_at) : null
    })
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

  // Delete existing review comments and re-insert
  await db.delete(schema.issueReviewComments).where(eq(schema.issueReviewComments.issueId, issueId))

  for (const comment of comments) {
    if (comment.user) {
      await ensureUser({
        id: comment.user.id,
        login: comment.user.login,
        avatar_url: comment.user.avatar_url
      })
    }

    await db.insert(schema.issueReviewComments).values({
      id: comment.id,
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
      createdAt: new Date(comment.created_at),
      updatedAt: new Date(comment.updated_at)
    })
  }
}
