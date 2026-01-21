import { eq, and } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import { Octokit } from 'octokit'
import { ensureUser } from './users'

/**
 * Fetch linked issues for a PR using GitHub's GraphQL API (closingIssuesReferences)
 */
export async function fetchLinkedIssueNumbers(octokit: Octokit, owner: string, repo: string, prNumber: number): Promise<number[]> {
  try {
    const response = await octokit.graphql<{
      repository: {
        pullRequest: {
          closingIssuesReferences: {
            nodes: Array<{ number: number }>
          }
        }
      }
    }>(`
      query($owner: String!, $repo: String!, $prNumber: Int!) {
        repository(owner: $owner, name: $repo) {
          pullRequest(number: $prNumber) {
            closingIssuesReferences(first: 50) {
              nodes {
                number
              }
            }
          }
        }
      }
    `, { owner, repo, prNumber })

    return response.repository.pullRequest.closingIssuesReferences.nodes.map(n => n.number)
  } catch (error) {
    console.warn(`[sync] Failed to fetch linked issues for PR #${prNumber}:`, error)
    return []
  }
}

/**
 * Update the issue-PR links based on GitHub's closingIssuesReferences
 * Handles many-to-many: a PR can link multiple issues, an issue can be linked by multiple PRs
 */
export async function updateLinkedIssues(prId: number, repositoryId: number, linkedIssueNumbers: number[]) {
  // Get current linked issue IDs for this PR
  const currentLinks = await db
    .select({ issueId: schema.issueLinkedPrs.issueId })
    .from(schema.issueLinkedPrs)
    .where(eq(schema.issueLinkedPrs.prId, prId))

  const currentIssueIds = new Set(currentLinks.map(l => l.issueId))

  // Get issue IDs from issue numbers
  const linkedIssues = linkedIssueNumbers.length > 0
    ? await db
        .select({ id: schema.issues.id, number: schema.issues.number })
        .from(schema.issues)
        .where(and(
          eq(schema.issues.repositoryId, repositoryId),
          eq(schema.issues.pullRequest, false)
        ))
    : []

  const issueNumberToId = new Map(linkedIssues.map(i => [i.number, i.id]))
  const newIssueIds = new Set(
    linkedIssueNumbers
      .map(n => issueNumberToId.get(n))
      .filter((id): id is number => id !== undefined)
  )

  // Remove links that no longer exist
  for (const currentIssueId of currentIssueIds) {
    if (!newIssueIds.has(currentIssueId)) {
      await db.delete(schema.issueLinkedPrs).where(and(
        eq(schema.issueLinkedPrs.prId, prId),
        eq(schema.issueLinkedPrs.issueId, currentIssueId)
      ))
    }
  }

  // Add new links
  for (const newIssueId of newIssueIds) {
    if (!currentIssueIds.has(newIssueId)) {
      await db.insert(schema.issueLinkedPrs)
        .values({ prId, issueId: newIssueId })
        .onConflictDoNothing()
    }
  }
}

/**
 * Clear all linked issues when a PR is deleted
 */
export async function clearLinkedIssues(prId: number) {
  await db.delete(schema.issueLinkedPrs).where(eq(schema.issueLinkedPrs.prId, prId))
}

// Helper: ensure type exists in the database
export async function ensureType(repositoryId: number, type: { id: number, name: string, color?: string | null, description?: string | null }): Promise<number | null> {
  const typeData = {
    name: type.name,
    color: type.color ?? null,
    description: type.description ?? null,
    updatedAt: new Date()
  }

  // Use upsert to avoid race conditions
  const [result] = await db.insert(schema.types).values({
    githubId: type.id,
    repositoryId,
    ...typeData
  }).onConflictDoUpdate({
    target: schema.types.githubId,
    set: typeData
  }).returning({ id: schema.types.id })

  return result!.id
}

// Helper: subscribe a user to an issue (idempotent)
export async function subscribeUserToIssue(issueId: number, userId: number) {
  try {
    await db.insert(schema.issueSubscriptions)
      .values({ issueId, userId })
      .onConflictDoNothing()
  } catch (error) {
    // Foreign key constraint failure is expected for users not in our system
    console.debug('[sync] Skipped issue subscription for user:', userId, error)
  }
}

// Helper: look up the database issue ID using repositoryId + number
// GitHub returns different IDs for issues vs PRs, so we use the DB ID
export async function getDbIssueId(repositoryId: number, issueNumber: number): Promise<number | null> {
  try {
    const [issue] = await db
      .select({ id: schema.issues.id })
      .from(schema.issues)
      .where(and(
        eq(schema.issues.repositoryId, repositoryId),
        eq(schema.issues.number, issueNumber)
      ))
    return issue?.id ?? null
  } catch (error) {
    console.error('[sync] Failed to get issue ID:', error)
    return null
  }
}

// Helper: look up the database label ID using GitHub label ID
export async function getDbLabelId(githubLabelId: number): Promise<number | null> {
  try {
    const [label] = await db
      .select({ id: schema.labels.id })
      .from(schema.labels)
      .where(eq(schema.labels.githubId, githubLabelId))
    return label?.id ?? null
  } catch (error) {
    console.error('[sync] Failed to get label ID:', error)
    return null
  }
}

// Helper: look up the database milestone ID using GitHub milestone ID
export async function getDbMilestoneId(githubMilestoneId: number): Promise<number | null> {
  try {
    const [milestone] = await db
      .select({ id: schema.milestones.id })
      .from(schema.milestones)
      .where(eq(schema.milestones.githubId, githubMilestoneId))
    return milestone?.id ?? null
  } catch (error) {
    console.error('[sync] Failed to get milestone ID:', error)
    return null
  }
}

// Helper: look up the database type ID using GitHub type ID
export async function getDbTypeId(githubTypeId: number): Promise<number | null> {
  try {
    const [type] = await db
      .select({ id: schema.types.id })
      .from(schema.types)
      .where(eq(schema.types.githubId, githubTypeId))
    return type?.id ?? null
  } catch (error) {
    console.error('[sync] Failed to get type ID:', error)
    return null
  }
}

export async function syncRepositoryInfo(accessToken: string, owner: string, repo: string) {
  const octokit = new Octokit({ auth: accessToken })

  const { data: repoData } = await octokit.rest.repos.get({ owner, repo })

  // Check if installation exists by account ID, create if not
  const accountId = repoData.owner.id
  let [installation] = await db.select().from(schema.installations).where(eq(schema.installations.accountId, accountId))

  if (!installation) {
    [installation] = await db.insert(schema.installations).values({
      githubId: accountId, // Use account ID as GitHub installation ID for now
      accountId,
      accountLogin: repoData.owner.login,
      accountType: repoData.owner.type,
      avatarUrl: repoData.owner.avatar_url
    }).returning()
  }

  // Check if repository exists by GitHub ID, create or update
  let [repository] = await db.select().from(schema.repositories).where(eq(schema.repositories.githubId, repoData.id))

  if (!repository) {
    [repository] = await db.insert(schema.repositories).values({
      githubId: repoData.id,
      installationId: installation!.id,
      name: repoData.name,
      fullName: repoData.full_name,
      private: repoData.private,
      description: repoData.description,
      htmlUrl: repoData.html_url,
      defaultBranch: repoData.default_branch,
      archived: repoData.archived,
      disabled: repoData.disabled
    }).returning()
  }

  return { repository: repository!, installation: installation! }
}

export async function syncLabels(accessToken: string, owner: string, repo: string, repositoryId: number) {
  const octokit = new Octokit({ auth: accessToken })

  const labelsData = await octokit.paginate(octokit.rest.issues.listLabelsForRepo, {
    owner,
    repo,
    per_page: 100
  })

  for (const label of labelsData) {
    const labelData = {
      name: label.name,
      color: label.color,
      description: label.description,
      default: label.default,
      updatedAt: new Date()
    }

    // Use upsert to avoid race conditions
    await db.insert(schema.labels).values({
      githubId: label.id,
      repositoryId,
      ...labelData
    }).onConflictDoUpdate({
      target: schema.labels.githubId,
      set: labelData
    })
  }

  return labelsData.length
}

export async function syncMilestones(accessToken: string, owner: string, repo: string, repositoryId: number) {
  const octokit = new Octokit({ auth: accessToken })

  const milestonesData = await octokit.paginate(octokit.rest.issues.listMilestones, {
    owner,
    repo,
    state: 'all',
    per_page: 100
  })

  for (const milestone of milestonesData) {
    const milestoneData = {
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

    // Use upsert to avoid race conditions
    await db.insert(schema.milestones).values({
      githubId: milestone.id,
      repositoryId,
      number: milestone.number,
      ...milestoneData
    }).onConflictDoUpdate({
      target: schema.milestones.githubId,
      set: milestoneData
    })
  }

  return milestonesData.length
}

export async function syncTypes(accessToken: string, owner: string, repo: string, repositoryId: number) {
  const octokit = new Octokit({ auth: accessToken })

  try {
    // GitHub issue types are organization-level, not repository-level
    // See: https://docs.github.com/en/rest/orgs/issue-types
    const typesData = await octokit.paginate(octokit.rest.orgs.listIssueTypes, {
      org: owner
    })

    for (const type of typesData) {
      if (!type) continue

      const typeData = {
        name: type.name,
        description: type.description,
        color: type.color,
        updatedAt: new Date()
      }

      // Use upsert to avoid race conditions
      await db.insert(schema.types).values({
        githubId: type.id,
        repositoryId,
        ...typeData
      }).onConflictDoUpdate({
        target: schema.types.githubId,
        set: typeData
      })
    }

    return typesData.length
  } catch (error: any) {
    // Issue types API only available for organizations with the feature enabled
    if (error.status === 404) {
      console.log(`[Sync] Issue types not available for ${owner}`)
      return 0
    }
    throw error
  }
}

export async function syncIssuesOnly(accessToken: string, owner: string, repo: string, repositoryId: number) {
  const octokit = new Octokit({ auth: accessToken })

  let issueCount = 0

  // Sync only open issues (closed issues are imported via webhooks/notifications)
  const issuesData = await octokit.paginate(octokit.rest.issues.listForRepo, {
    owner,
    repo,
    state: 'open',
    per_page: 100
  })

  for (const issue of issuesData) {
    // Skip pull requests (they come from pulls API)
    if (issue.pull_request) continue
    issueCount++

    // Ensure author exists as shadow user and get internal ID
    let userId: number | null = null
    if (issue.user) {
      userId = await ensureUser({
        id: issue.user.id,
        login: issue.user.login,
        avatar_url: issue.user.avatar_url
      })
    }

    // Get milestone ID if present
    let milestoneId: number | null = null
    if (issue.milestone?.id) {
      milestoneId = await getDbMilestoneId(issue.milestone.id)
    }

    // Get type ID if present
    let typeId: number | null = null
    if (issue.type?.id) {
      typeId = await getDbTypeId(issue.type.id)
    }

    const issueData = {
      githubId: issue.id, // Store GitHub's ID for reference
      pullRequest: false,
      repositoryId,
      milestoneId,
      typeId,
      userId,
      number: issue.number,
      title: issue.title,
      body: issue.body,
      state: issue.state,
      stateReason: issue.state_reason,
      htmlUrl: issue.html_url,
      locked: issue.locked,
      closedAt: issue.closed_at ? new Date(issue.closed_at) : null,
      // Engagement metrics from GitHub API
      reactionCount: issue.reactions?.total_count ?? 0,
      commentCount: issue.comments ?? 0,
      // Use GitHub timestamps
      createdAt: new Date(issue.created_at),
      updatedAt: new Date(issue.updated_at)
    }

    // Use upsert to avoid race conditions (compound key: repositoryId + number)
    const [result] = await db.insert(schema.issues)
      .values(issueData)
      .onConflictDoUpdate({
        target: [schema.issues.repositoryId, schema.issues.number],
        set: issueData
      })
      .returning({ id: schema.issues.id })

    const issueId = result!.id

    // Subscribe issue author to the issue
    if (userId) {
      await subscribeUserToIssue(issueId, userId)
    }

    // Sync assignees
    await syncIssueAssignees(issueId, issue.assignees || [])

    // Sync labels
    const labelGithubIds = issue.labels
      .filter((l): l is { id: number } => typeof l === 'object' && 'id' in l)
      .map(l => l.id)
    await syncIssueLabels(issueId, labelGithubIds)

    // Sync comments
    await syncIssueComments(octokit, owner, repo, issue.number, issueId)

    // Mark as synced
    await db.update(schema.issues).set({ synced: true, syncedAt: new Date() }).where(eq(schema.issues.id, issueId))
  }

  return issueCount
}

export async function syncPullRequestsOnly(accessToken: string, owner: string, repo: string, repositoryId: number) {
  const octokit = new Octokit({ auth: accessToken })

  let prCount = 0

  // Sync only open pull requests (closed/merged PRs are imported via webhooks/notifications)
  const prsData = await octokit.paginate(octokit.rest.pulls.list, {
    owner,
    repo,
    state: 'open',
    per_page: 100
  })

  for (const pr of prsData) {
    prCount++

    // Ensure author exists as shadow user and get internal ID
    let userId: number | null = null
    if (pr.user) {
      userId = await ensureUser({
        id: pr.user.id,
        login: pr.user.login,
        avatar_url: pr.user.avatar_url
      })
    }

    // Get milestone ID if present
    let milestoneId: number | null = null
    if (pr.milestone?.id) {
      milestoneId = await getDbMilestoneId(pr.milestone.id)
    }

    const prData = {
      githubId: pr.id, // Store GitHub's ID for reference
      pullRequest: true,
      repositoryId,
      milestoneId,
      userId,
      number: pr.number,
      title: pr.title,
      body: pr.body,
      state: pr.state,
      htmlUrl: pr.html_url,
      locked: pr.locked,
      // PR-specific fields
      draft: pr.draft,
      merged: pr.merged_at !== null,
      headRef: pr.head.ref,
      headSha: pr.head.sha,
      baseRef: pr.base.ref,
      baseSha: pr.base.sha,
      mergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
      closedAt: pr.closed_at ? new Date(pr.closed_at) : null,
      // Engagement metrics (reactions not available in pulls.list, will be updated via webhooks)
      reactionCount: 0,
      commentCount: 0,
      // Use GitHub timestamps
      createdAt: new Date(pr.created_at),
      updatedAt: new Date(pr.updated_at)
    }

    // Use upsert to avoid race conditions (compound key: repositoryId + number)
    const [result] = await db.insert(schema.issues)
      .values(prData)
      .onConflictDoUpdate({
        target: [schema.issues.repositoryId, schema.issues.number],
        set: prData
      })
      .returning({ id: schema.issues.id })

    const prId = result!.id

    // Subscribe PR author to the PR
    if (userId) {
      await subscribeUserToIssue(prId, userId)
    }

    // Sync assignees
    await syncIssueAssignees(prId, pr.assignees || [])

    // Sync labels
    await syncIssueLabels(prId, pr.labels.map(l => l.id))

    // Sync requested reviewers
    const reviewers = (pr.requested_reviewers as any[])?.filter(r => r.id) || []
    await syncIssueRequestedReviewers(prId, reviewers)

    // Sync comments
    await syncIssueComments(octokit, owner, repo, pr.number, prId)

    // Sync PR reviews
    await syncPRReviews(octokit, owner, repo, pr.number, prId)

    // Sync PR review comments (inline code comments)
    await syncPRReviewComments(octokit, owner, repo, pr.number, prId)

    // Sync CI status for this PR's head commit (check runs + commit statuses)
    // Note: Check runs include GitHub Actions jobs, commit statuses include Vercel deployments
    if (pr.head?.sha) {
      await syncPRCheckRuns(octokit, owner, repo, repositoryId, pr.head.sha)
      await syncPRCommitStatuses(octokit, owner, repo, repositoryId, pr.head.sha)
    }

    // Update linked issues using GitHub's closingIssuesReferences API
    const linkedIssueNumbers = await fetchLinkedIssueNumbers(octokit, owner, repo, pr.number)
    await updateLinkedIssues(prId, repositoryId, linkedIssueNumbers)

    // Mark as synced
    await db.update(schema.issues).set({ synced: true, syncedAt: new Date() }).where(eq(schema.issues.id, prId))
  }

  return prCount
}

// Helper: sync issue assignees
async function syncIssueAssignees(issueId: number, assignees: { id: number, login: string, avatar_url: string }[]) {
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

  // Insert new labels
  for (const dbLabelId of newDbIds) {
    if (!existingDbIds.has(dbLabelId)) {
      await db.insert(schema.issueLabels)
        .values({ issueId, labelId: dbLabelId })
        .onConflictDoNothing()
    }
  }
}

// Helper: sync issue requested reviewers
async function syncIssueRequestedReviewers(issueId: number, reviewers: { id: number, login: string, avatar_url?: string }[]) {
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

// Helper: sync issue comments
async function syncIssueComments(octokit: Octokit, owner: string, repo: string, issueNumber: number, issueId: number) {
  try {
    const comments = await octokit.paginate(octokit.rest.issues.listComments, {
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

        // Subscribe commenter to the issue
        if (userId) {
          await subscribeUserToIssue(issueId, userId)
        }
      }

      const commentData = {
        issueId,
        userId,
        body: comment.body || '',
        htmlUrl: comment.html_url,
        createdAt: new Date(comment.created_at),
        updatedAt: new Date(comment.updated_at)
      }

      // Use upsert to avoid race conditions
      await db.insert(schema.issueComments).values({
        githubId: comment.id,
        ...commentData
      }).onConflictDoUpdate({
        target: schema.issueComments.githubId,
        set: commentData
      })
    }
  } catch (error) {
    console.error(`[Sync] Failed to sync comments for issue #${issueNumber}:`, error)
  }
}

// Helper: sync PR reviews
async function syncPRReviews(octokit: Octokit, owner: string, repo: string, prNumber: number, issueId: number) {
  try {
    const reviews = await octokit.paginate(octokit.rest.pulls.listReviews, {
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

        // Subscribe reviewer to the PR
        if (userId) {
          await subscribeUserToIssue(issueId, userId)
        }
      }

      const reviewData = {
        issueId,
        userId,
        body: review.body,
        state: review.state as 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED' | 'PENDING',
        htmlUrl: review.html_url,
        commitId: review.commit_id,
        submittedAt: review.submitted_at ? new Date(review.submitted_at) : null,
        updatedAt: new Date()
      }

      // Use upsert to avoid race conditions
      await db.insert(schema.issueReviews).values({
        githubId: review.id,
        ...reviewData
      }).onConflictDoUpdate({
        target: schema.issueReviews.githubId,
        set: reviewData
      })
    }
  } catch (error) {
    console.error(`[Sync] Failed to sync reviews for PR #${prNumber}:`, error)
  }
}

// Helper: sync PR review comments (inline code comments)
async function syncPRReviewComments(octokit: Octokit, owner: string, repo: string, prNumber: number, issueId: number) {
  try {
    const comments = await octokit.paginate(octokit.rest.pulls.listReviewComments, {
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

      // Use upsert to avoid race conditions
      await db.insert(schema.issueReviewComments).values({
        githubId: comment.id,
        ...commentData
      }).onConflictDoUpdate({
        target: schema.issueReviewComments.githubId,
        set: commentData
      })
    }
  } catch (error) {
    console.error(`[Sync] Failed to sync review comments for PR #${prNumber}:`, error)
  }
}

// Sync check runs (third-party integrations like Vercel) for a specific commit
async function syncPRCheckRuns(octokit: Octokit, owner: string, repo: string, repositoryId: number, headSha: string) {
  try {
    // Fetch check runs for this specific commit (paginated)
    const checkRuns = await octokit.paginate(octokit.rest.checks.listForRef, {
      owner,
      repo,
      ref: headSha,
      per_page: 100
    })

    type WorkflowConclusion = 'success' | 'failure' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required' | 'stale' | 'neutral' | 'startup_failure'

    for (const check of checkRuns) {
      const checkData = {
        repositoryId,
        headSha,
        name: check.name,
        status: check.status,
        conclusion: check.conclusion as WorkflowConclusion | null,
        htmlUrl: check.html_url,
        detailsUrl: check.details_url,
        appSlug: check.app?.slug || null,
        appName: check.app?.name || null,
        startedAt: check.started_at ? new Date(check.started_at) : null,
        completedAt: check.completed_at ? new Date(check.completed_at) : null,
        updatedAt: new Date()
      }

      // Use upsert to avoid race conditions
      await db.insert(schema.checkRuns).values({
        githubId: check.id,
        ...checkData
      }).onConflictDoUpdate({
        target: schema.checkRuns.githubId,
        set: checkData
      })
    }
  } catch (error: any) {
    // Checks API may not be available for all repositories
    if (error.status === 403 || error.status === 404) {
      console.log(`[Sync] Check runs not available for ${owner}/${repo} (status: ${error.status})`)
      return
    }
    console.error(`[Sync] Failed to sync check runs for commit ${headSha}:`, error)
  }
}

// Sync commit statuses (GitHub Status API - used by Vercel deployments, etc.) for a specific commit
async function syncPRCommitStatuses(octokit: Octokit, owner: string, repo: string, repositoryId: number, headSha: string) {
  try {
    // Fetch commit statuses for this specific commit (paginated)
    const statuses = await octokit.paginate(octokit.rest.repos.listCommitStatusesForRef, {
      owner,
      repo,
      ref: headSha,
      per_page: 100
    })

    // GitHub returns statuses in reverse chronological order, we only want the latest per context
    const seenContexts = new Set<string>()
    const latestStatuses = []

    for (const status of statuses) {
      if (!seenContexts.has(status.context)) {
        seenContexts.add(status.context)
        latestStatuses.push(status)
      }
    }

    type CommitStatusState = 'error' | 'failure' | 'pending' | 'success'

    for (const status of latestStatuses) {
      const statusData = {
        repositoryId,
        sha: headSha,
        state: status.state as CommitStatusState,
        context: status.context,
        description: status.description || null,
        targetUrl: status.target_url || null,
        updatedAt: new Date()
      }

      // Use upsert to avoid race conditions
      await db.insert(schema.commitStatuses).values({
        githubId: status.id,
        ...statusData
      }).onConflictDoUpdate({
        target: schema.commitStatuses.githubId,
        set: statusData
      })
    }
  } catch (error: any) {
    // Statuses API may not be available for all repositories
    if (error.status === 403 || error.status === 404) {
      console.log(`[Sync] Commit statuses not available for ${owner}/${repo} (status: ${error.status})`)
      return
    }
    console.error(`[Sync] Failed to sync commit statuses for commit ${headSha}:`, error)
  }
}

export async function updateRepositoryLastSynced(repositoryId: number) {
  await db.update(schema.repositories).set({
    lastSyncedAt: new Date(),
    updatedAt: new Date()
  }).where(eq(schema.repositories.id, repositoryId))
}

export async function syncCollaborators(accessToken: string, owner: string, repo: string, repositoryId: number) {
  const octokit = new Octokit({ auth: accessToken })

  try {
    // Fetch collaborators with write access or higher (paginated)
    const collaborators = await octokit.paginate(octokit.rest.repos.listCollaborators, {
      owner,
      repo,
      affiliation: 'all',
      per_page: 100
    })

    // Filter to only include users with write, maintain, or admin permissions
    const maintainers = collaborators.filter(c =>
      c.permissions?.admin || c.permissions?.maintain || c.permissions?.push
    )

    // Get all existing subscriptions for this repo once
    const existingSubscriptions = await db
      .select()
      .from(schema.repositorySubscriptions)
      .where(eq(schema.repositorySubscriptions.repositoryId, repositoryId))

    const subscribedUserIds = new Set(existingSubscriptions.map(s => s.userId))

    // Get existing collaborators
    const existingCollaborators = await db
      .select()
      .from(schema.repositoryCollaborators)
      .where(eq(schema.repositoryCollaborators.repositoryId, repositoryId))

    // Build map of GitHub ID -> internal ID for maintainers
    const maintainerDbIds = new Map<number, number>()
    for (const maintainer of maintainers) {
      const dbUserId = await ensureUser({
        id: maintainer.id,
        login: maintainer.login,
        avatar_url: maintainer.avatar_url
      })
      if (dbUserId) {
        maintainerDbIds.set(maintainer.id, dbUserId)
      }
    }

    const newCollaboratorDbIds = new Set(maintainerDbIds.values())

    // Delete collaborators that are no longer maintainers
    for (const existing of existingCollaborators) {
      if (!newCollaboratorDbIds.has(existing.userId)) {
        await db.delete(schema.repositoryCollaborators).where(
          and(
            eq(schema.repositoryCollaborators.repositoryId, repositoryId),
            eq(schema.repositoryCollaborators.userId, existing.userId)
          )
        )
      }
    }

    // Store each collaborator and subscribe them
    for (const maintainer of maintainers) {
      try {
        const dbUserId = maintainerDbIds.get(maintainer.id)
        if (!dbUserId) continue

        // Determine permission level
        const permission = maintainer.permissions?.admin
          ? 'admin'
          : maintainer.permissions?.maintain
            ? 'maintain'
            : 'write'

        // Insert or update collaborator
        await db.insert(schema.repositoryCollaborators)
          .values({ repositoryId, userId: dbUserId, permission })
          .onConflictDoUpdate({
            target: [schema.repositoryCollaborators.repositoryId, schema.repositoryCollaborators.userId],
            set: { permission, updatedAt: new Date() }
          })

        // Subscribe if not already subscribed
        if (!subscribedUserIds.has(dbUserId)) {
          await db.insert(schema.repositorySubscriptions).values({
            userId: dbUserId,
            repositoryId,
            issues: true,
            pullRequests: true,
            releases: true,
            ci: true,
            mentions: true,
            activity: true
          })
        }
      } catch (error) {
        console.warn(`[sync] Failed to sync maintainer ${maintainer.login}:`, error)
      }
    }

    return maintainers.length
  } catch (error) {
    console.warn(`[sync] Failed to sync collaborators for ${owner}/${repo}:`, error)
    return 0
  }
}
