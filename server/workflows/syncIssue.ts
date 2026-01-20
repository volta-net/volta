export interface SyncIssueInput {
  accessToken: string
  issueId: number
  repositoryFullName: string
  issueNumber: number
  isPullRequest: boolean
}

export interface SyncIssueResult {
  success: boolean
  issueId: number
}

// Step: Fetch PR data from GitHub
async function stepFetchPR(accessToken: string, owner: string, repo: string, prNumber: number) {
  'use step'
  const { Octokit } = await import('octokit')
  console.log(`[Workflow] Fetching PR #${prNumber} from GitHub`)
  const octokit = new Octokit({ auth: accessToken })
  const { data: ghPr } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber
  })
  return ghPr
}

// Step: Update PR data in database
async function stepUpdatePRData(issueId: number, prData: any) {
  'use step'
  const { eq } = await import('drizzle-orm')
  const { db, schema } = await import('@nuxthub/db')
  const { ensureUser } = await import('../utils/users')

  console.log(`[Workflow] Updating PR data for issue ${issueId}`)

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
}

// Step: Fetch issue data from GitHub
async function stepFetchIssue(accessToken: string, owner: string, repo: string, issueNumber: number) {
  'use step'
  const { Octokit } = await import('octokit')
  console.log(`[Workflow] Fetching issue #${issueNumber} from GitHub`)
  const octokit = new Octokit({ auth: accessToken })
  const { data: ghIssue } = await octokit.rest.issues.get({
    owner,
    repo,
    issue_number: issueNumber
  })
  return ghIssue
}

// Step: Update issue data in database
async function stepUpdateIssueData(issueId: number, issueData: any) {
  'use step'
  const { eq } = await import('drizzle-orm')
  const { db, schema } = await import('@nuxthub/db')
  const { ensureUser } = await import('../utils/users')

  console.log(`[Workflow] Updating issue data for issue ${issueId}`)

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
}

// Step: Sync assignees
async function stepSyncAssignees(issueId: number, assignees: { id: number, login: string, avatar_url: string }[]) {
  'use step'
  const { eq, and } = await import('drizzle-orm')
  const { db, schema } = await import('@nuxthub/db')
  const { ensureUser } = await import('../utils/users')

  console.log(`[Workflow] Syncing assignees for issue ${issueId}`)

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

// Step: Sync labels
async function stepSyncLabels(issueId: number, labelGithubIds: number[]) {
  'use step'
  const { eq, and } = await import('drizzle-orm')
  const { db, schema } = await import('@nuxthub/db')
  const { getDbLabelId } = await import('../utils/sync')

  console.log(`[Workflow] Syncing labels for issue ${issueId}`)

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

// Step: Sync requested reviewers (PRs only)
async function stepSyncRequestedReviewers(issueId: number, reviewers: { id: number, login: string, avatar_url?: string }[]) {
  'use step'
  const { eq, and } = await import('drizzle-orm')
  const { db, schema } = await import('@nuxthub/db')
  const { ensureUser } = await import('../utils/users')

  console.log(`[Workflow] Syncing requested reviewers for issue ${issueId}`)

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

// Step: Sync comments
async function stepSyncComments(accessToken: string, owner: string, repo: string, issueNumber: number, issueId: number) {
  'use step'
  const { Octokit } = await import('octokit')
  const { eq } = await import('drizzle-orm')
  const { db, schema } = await import('@nuxthub/db')
  const { ensureUser } = await import('../utils/users')

  console.log(`[Workflow] Syncing comments for issue ${issueId}`)

  const octokit = new Octokit({ auth: accessToken })

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

// Step: Sync reviews (PRs only)
async function stepSyncReviews(accessToken: string, owner: string, repo: string, prNumber: number, issueId: number) {
  'use step'
  const { Octokit } = await import('octokit')
  const { eq } = await import('drizzle-orm')
  const { db, schema } = await import('@nuxthub/db')
  const { ensureUser } = await import('../utils/users')

  console.log(`[Workflow] Syncing reviews for PR ${issueId}`)

  const octokit = new Octokit({ auth: accessToken })

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

// Step: Sync review comments (PRs only)
async function stepSyncReviewComments(accessToken: string, owner: string, repo: string, prNumber: number, issueId: number) {
  'use step'
  const { Octokit } = await import('octokit')
  const { eq } = await import('drizzle-orm')
  const { db, schema } = await import('@nuxthub/db')
  const { ensureUser } = await import('../utils/users')

  console.log(`[Workflow] Syncing review comments for PR ${issueId}`)

  const octokit = new Octokit({ auth: accessToken })

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

// Step: Mark issue as synced
async function stepMarkSynced(issueId: number) {
  'use step'
  const { eq } = await import('drizzle-orm')
  const { db, schema } = await import('@nuxthub/db')

  console.log(`[Workflow] Marking issue ${issueId} as synced`)
  await db.update(schema.issues).set({ synced: true, syncedAt: new Date() }).where(eq(schema.issues.id, issueId))
}

/**
 * Durable workflow to sync an individual issue or PR from GitHub.
 * Used when manually refreshing issue data.
 */
export async function syncIssueWorkflow(input: SyncIssueInput): Promise<SyncIssueResult> {
  'use workflow'
  const { accessToken, issueId, repositoryFullName, issueNumber, isPullRequest } = input
  const [owner, repo] = repositoryFullName.split('/')

  console.log(`[Workflow] Syncing ${isPullRequest ? 'PR' : 'issue'} #${issueNumber} from ${repositoryFullName}`)

  if (isPullRequest) {
    // Sync PR
    const prData = await stepFetchPR(accessToken, owner, repo, issueNumber)
    await stepUpdatePRData(issueId, prData)
    await stepSyncAssignees(issueId, prData.assignees || [])
    await stepSyncLabels(issueId, prData.labels.map(l => l.id))
    const reviewers = (prData.requested_reviewers as any[])?.filter(r => r.id) || []
    await stepSyncRequestedReviewers(issueId, reviewers)
    await stepSyncComments(accessToken, owner, repo, issueNumber, issueId)
    await stepSyncReviews(accessToken, owner, repo, issueNumber, issueId)
    await stepSyncReviewComments(accessToken, owner, repo, issueNumber, issueId)
  } else {
    // Sync issue
    const issueData = await stepFetchIssue(accessToken, owner, repo, issueNumber)
    await stepUpdateIssueData(issueId, issueData)
    await stepSyncAssignees(issueId, issueData.assignees || [])
    const labelGithubIds = issueData.labels
      .filter((l): l is { id: number } => typeof l === 'object' && 'id' in l)
      .map(l => l.id)
    await stepSyncLabels(issueId, labelGithubIds)
    await stepSyncComments(accessToken, owner, repo, issueNumber, issueId)
  }

  // Mark as synced
  await stepMarkSynced(issueId)

  console.log(`[Workflow] Sync completed for ${isPullRequest ? 'PR' : 'issue'} #${issueNumber}`)

  return {
    success: true,
    issueId
  }
}
