import { eq, and } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import { Octokit } from 'octokit'
import { ensureUser } from '../../../../../../utils/users'
import { getDbLabelId } from '../../../../../../utils/sync'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const owner = getRouterParam(event, 'owner')
  const name = getRouterParam(event, 'name')
  const numberParam = getRouterParam(event, 'number')

  if (!owner || !name || !numberParam) {
    throw createError({ statusCode: 400, message: 'Owner, name, and issue number are required' })
  }

  const issueNumber = parseInt(numberParam)
  if (isNaN(issueNumber)) {
    throw createError({ statusCode: 400, message: 'Invalid issue number' })
  }

  // Find repository by owner/name
  const fullName = `${owner}/${name}`
  const repository = await db.query.repositories.findFirst({
    where: eq(schema.repositories.fullName, fullName)
  })

  if (!repository) {
    throw createError({ statusCode: 404, message: 'Repository not found' })
  }

  // Check user has access to this repository
  await requireRepositoryAccess(user.id, repository.id)

  // Fetch issue with relations
  const issue = await db.query.issues.findFirst({
    where: and(
      eq(schema.issues.repositoryId, repository.id),
      eq(schema.issues.number, issueNumber)
    ),
    with: {
      repository: true
    }
  })

  if (!issue) {
    throw createError({ statusCode: 404, message: 'Issue not found' })
  }

  // Get valid access token (refreshes if expired)
  const accessToken = await getValidAccessToken(event)

  // Sync issue directly (synchronous - needed for UI to wait)
  await syncIssueFromGitHub(accessToken, owner, name, issue.id, issueNumber, issue.pullRequest)

  // Re-fetch issue with fresh data and all relations
  const freshIssue = await db.query.issues.findFirst({
    where: eq(schema.issues.id, issue.id),
    with: {
      repository: true,
      milestone: true,
      user: { columns: PRIVATE_USER_COLUMNS },
      closedBy: { columns: PRIVATE_USER_COLUMNS },
      mergedBy: { columns: PRIVATE_USER_COLUMNS },
      assignees: { with: { user: { columns: PRIVATE_USER_COLUMNS } } },
      labels: { with: { label: true } },
      requestedReviewers: { with: { user: { columns: PRIVATE_USER_COLUMNS } } },
      comments: {
        with: { user: { columns: PRIVATE_USER_COLUMNS } },
        orderBy: (comments, { asc }) => [asc(comments.createdAt)]
      },
      reviews: {
        with: { user: { columns: PRIVATE_USER_COLUMNS } },
        orderBy: (reviews, { asc }) => [asc(reviews.submittedAt)]
      },
      reviewComments: {
        with: { user: { columns: PRIVATE_USER_COLUMNS }, review: true },
        orderBy: (reviewComments, { asc }) => [asc(reviewComments.createdAt)]
      }
    }
  })

  if (!freshIssue) {
    throw createError({ statusCode: 404, message: 'Issue not found after sync' })
  }

  // Check if user is subscribed to this issue
  const subscription = await db.query.issueSubscriptions.findFirst({
    where: and(
      eq(schema.issueSubscriptions.issueId, issue.id),
      eq(schema.issueSubscriptions.userId, user.id)
    )
  })

  return {
    ...freshIssue,
    assignees: freshIssue.assignees.map(a => a.user),
    labels: freshIssue.labels.map(l => l.label),
    requestedReviewers: freshIssue.requestedReviewers.map(r => r.user),
    isSubscribed: !!subscription
  }
})

// Direct sync function (not a workflow)
async function syncIssueFromGitHub(
  accessToken: string,
  owner: string,
  repo: string,
  issueId: number,
  issueNumber: number,
  isPullRequest: boolean
) {
  const octokit = new Octokit({ auth: accessToken })

  if (isPullRequest) {
    // Fetch PR data
    const { data: prData } = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: issueNumber
    })

    // Ensure user exists
    if (prData.user) {
      await ensureUser({
        id: prData.user.id,
        login: prData.user.login,
        avatar_url: prData.user.avatar_url
      })
    }

    let mergedById: number | null = null
    if (prData.merged_by) {
      mergedById = await ensureUser({
        id: prData.merged_by.id,
        login: prData.merged_by.login,
        avatar_url: prData.merged_by.avatar_url
      })
    }

    // Update PR data
    await db.update(schema.issues).set({
      title: prData.title,
      body: prData.body,
      state: prData.state,
      locked: prData.locked,
      draft: prData.draft,
      merged: prData.merged_at !== null,
      commits: prData.commits,
      additions: prData.additions,
      deletions: prData.deletions,
      changedFiles: prData.changed_files,
      headRef: prData.head.ref,
      headSha: prData.head.sha,
      baseRef: prData.base.ref,
      baseSha: prData.base.sha,
      mergedAt: prData.merged_at ? new Date(prData.merged_at) : null,
      mergedById,
      closedAt: prData.closed_at ? new Date(prData.closed_at) : null,
      closedById: mergedById,
      commentCount: prData.comments,
      updatedAt: new Date(prData.updated_at)
    }).where(eq(schema.issues.id, issueId))

    // Sync assignees
    await syncAssignees(issueId, prData.assignees || [])

    // Sync labels
    const labelGithubIds = prData.labels
      .filter(l => typeof l === 'object' && 'id' in l)
      .map(l => l.id)
    await syncLabels(issueId, labelGithubIds)

    // Sync requested reviewers
    const reviewers = (prData.requested_reviewers as any[])?.filter(r => r.id) || []
    await syncRequestedReviewers(issueId, reviewers)

    // Sync comments
    await syncComments(octokit, owner, repo, issueNumber, issueId)

    // Sync reviews
    await syncReviews(octokit, owner, repo, issueNumber, issueId)

    // Sync review comments
    await syncReviewComments(octokit, owner, repo, issueNumber, issueId)
  } else {
    // Fetch issue data
    const { data: issueData } = await octokit.rest.issues.get({
      owner,
      repo,
      issue_number: issueNumber
    })

    // Ensure user exists
    if (issueData.user) {
      await ensureUser({
        id: issueData.user.id,
        login: issueData.user.login,
        avatar_url: issueData.user.avatar_url
      })
    }

    let closedById: number | null = null
    if (issueData.closed_by) {
      closedById = await ensureUser({
        id: issueData.closed_by.id,
        login: issueData.closed_by.login,
        avatar_url: issueData.closed_by.avatar_url
      })
    }

    // Update issue data
    await db.update(schema.issues).set({
      title: issueData.title,
      body: issueData.body,
      state: issueData.state,
      stateReason: issueData.state_reason,
      locked: issueData.locked,
      closedAt: issueData.closed_at ? new Date(issueData.closed_at) : null,
      closedById,
      commentCount: issueData.comments,
      reactionCount: issueData.reactions?.total_count ?? 0,
      updatedAt: new Date(issueData.updated_at)
    }).where(eq(schema.issues.id, issueId))

    // Sync assignees
    await syncAssignees(issueId, issueData.assignees || [])

    // Sync labels
    const labelGithubIds = issueData.labels
      .filter((l): l is { id: number } => typeof l === 'object' && 'id' in l)
      .map(l => l.id)
    await syncLabels(issueId, labelGithubIds)

    // Sync comments
    await syncComments(octokit, owner, repo, issueNumber, issueId)
  }

  // Mark as synced
  await db.update(schema.issues).set({ synced: true, syncedAt: new Date() }).where(eq(schema.issues.id, issueId))
}

// Helper functions
async function syncAssignees(issueId: number, assignees: { id: number, login: string, avatar_url: string }[]) {
  const existingAssignees = await db
    .select()
    .from(schema.issueAssignees)
    .where(eq(schema.issueAssignees.issueId, issueId))

  const existingDbIds = new Set(existingAssignees.map(a => a.userId))

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

  for (const [_githubId, dbUserId] of newAssigneeDbIds) {
    if (!existingDbIds.has(dbUserId)) {
      await db.insert(schema.issueAssignees)
        .values({ issueId, userId: dbUserId })
        .onConflictDoNothing()
    }
  }
}

async function syncLabels(issueId: number, labelGithubIds: number[]) {
  const existingLabels = await db
    .select()
    .from(schema.issueLabels)
    .where(eq(schema.issueLabels.issueId, issueId))

  const existingDbIds = new Set(existingLabels.map(l => l.labelId))

  const newDbIds = new Set<number>()
  for (const githubId of labelGithubIds) {
    const dbId = await getDbLabelId(githubId)
    if (dbId) {
      newDbIds.add(dbId)
    }
  }

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
  const existingReviewers = await db
    .select()
    .from(schema.issueRequestedReviewers)
    .where(eq(schema.issueRequestedReviewers.issueId, issueId))

  const existingDbIds = new Set(existingReviewers.map(r => r.userId))

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

  for (const [_githubId, dbUserId] of newReviewerDbIds) {
    if (!existingDbIds.has(dbUserId)) {
      await db.insert(schema.issueRequestedReviewers)
        .values({ issueId, userId: dbUserId })
        .onConflictDoNothing()
    }
  }
}

async function syncComments(octokit: Octokit, owner: string, repo: string, issueNumber: number, issueId: number) {
  const { data: comments } = await octokit.rest.issues.listComments({
    owner,
    repo,
    issue_number: issueNumber,
    per_page: 100
  })

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
      createdAt: new Date(comment.created_at),
      updatedAt: new Date(comment.updated_at)
    }

    const existing = await db.query.issueComments.findFirst({
      where: eq(schema.issueComments.githubId, comment.id)
    })

    if (existing) {
      await db.update(schema.issueComments).set(commentData).where(eq(schema.issueComments.id, existing.id))
    } else {
      await db.insert(schema.issueComments).values({
        githubId: comment.id,
        ...commentData
      })
    }
  }
}

async function syncReviews(octokit: Octokit, owner: string, repo: string, prNumber: number, issueId: number) {
  const { data: reviews } = await octokit.rest.pulls.listReviews({
    owner,
    repo,
    pull_number: prNumber,
    per_page: 100
  })

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

async function syncReviewComments(octokit: Octokit, owner: string, repo: string, prNumber: number, issueId: number) {
  const { data: comments } = await octokit.rest.pulls.listReviewComments({
    owner,
    repo,
    pull_number: prNumber,
    per_page: 100
  })

  for (const comment of comments) {
    let userId: number | null = null
    if (comment.user) {
      userId = await ensureUser({
        id: comment.user.id,
        login: comment.user.login,
        avatar_url: comment.user.avatar_url
      })
    }

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

    const existing = await db.query.issueReviewComments.findFirst({
      where: eq(schema.issueReviewComments.githubId, comment.id)
    })

    if (existing) {
      await db.update(schema.issueReviewComments).set(commentData).where(eq(schema.issueReviewComments.id, existing.id))
    } else {
      await db.insert(schema.issueReviewComments).values({
        githubId: comment.id,
        ...commentData
      })
    }
  }
}
