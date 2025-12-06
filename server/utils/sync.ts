import { eq, and } from 'drizzle-orm'
import { db, schema } from 'hub:db'
import { Octokit } from 'octokit'
import { ensureUser } from './users'

// Helper: subscribe a user to an issue (idempotent)
export async function subscribeUserToIssue(issueId: number, userId: number) {
  try {
    const [existing] = await db
      .select()
      .from(schema.issueSubscriptions)
      .where(and(
        eq(schema.issueSubscriptions.issueId, issueId),
        eq(schema.issueSubscriptions.userId, userId)
      ))

    if (!existing) {
      await db.insert(schema.issueSubscriptions).values({
        issueId,
        userId
      })
    }
  } catch (error) {
    // Foreign key constraint failure is expected for users not in our system
    console.debug('[sync] Skipped issue subscription for user:', userId, error)
  }
}

export async function syncRepositoryInfo(accessToken: string, owner: string, repo: string) {
  const octokit = new Octokit({ auth: accessToken })

  const { data: repoData } = await octokit.rest.repos.get({ owner, repo })

  // Check if installation exists, create if not
  // Note: We use owner ID as installation ID for user-based auth
  const accountId = repoData.owner.id
  let [installation] = await db.select().from(schema.installations).where(eq(schema.installations.accountId, accountId))

  if (!installation) {
    [installation] = await db.insert(schema.installations).values({
      id: accountId, // Use account ID as installation ID for now
      accountId,
      accountLogin: repoData.owner.login,
      accountType: repoData.owner.type,
      avatarUrl: repoData.owner.avatar_url
    }).returning()
  }

  // Check if repository exists, create or update
  let [repository] = await db.select().from(schema.repositories).where(eq(schema.repositories.id, repoData.id))

  if (!repository) {
    [repository] = await db.insert(schema.repositories).values({
      id: repoData.id,
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
    const [existingLabel] = await db.select().from(schema.labels).where(eq(schema.labels.id, label.id))

    if (existingLabel) {
      await db.update(schema.labels).set({
        name: label.name,
        color: label.color,
        description: label.description,
        default: label.default,
        updatedAt: new Date()
      }).where(eq(schema.labels.id, label.id))
    } else {
      await db.insert(schema.labels).values({
        id: label.id,
        repositoryId,
        name: label.name,
        color: label.color,
        description: label.description,
        default: label.default
      })
    }
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
    const [existingMilestone] = await db.select().from(schema.milestones).where(eq(schema.milestones.id, milestone.id))

    if (existingMilestone) {
      await db.update(schema.milestones).set({
        title: milestone.title,
        description: milestone.description,
        state: milestone.state,
        htmlUrl: milestone.html_url,
        openIssues: milestone.open_issues,
        closedIssues: milestone.closed_issues,
        dueOn: milestone.due_on ? new Date(milestone.due_on) : null,
        closedAt: milestone.closed_at ? new Date(milestone.closed_at) : null,
        updatedAt: new Date()
      }).where(eq(schema.milestones.id, milestone.id))
    } else {
      await db.insert(schema.milestones).values({
        id: milestone.id,
        repositoryId,
        number: milestone.number,
        title: milestone.title,
        description: milestone.description,
        state: milestone.state,
        htmlUrl: milestone.html_url,
        openIssues: milestone.open_issues,
        closedIssues: milestone.closed_issues,
        dueOn: milestone.due_on ? new Date(milestone.due_on) : null,
        closedAt: milestone.closed_at ? new Date(milestone.closed_at) : null
      })
    }
  }

  return milestonesData.length
}

export async function syncIssues(accessToken: string, owner: string, repo: string, repositoryId: number) {
  const octokit = new Octokit({ auth: accessToken })

  let issueCount = 0
  let prCount = 0

  // Sync issues (GitHub API returns issues without PRs when filtering)
  const issuesData = await octokit.paginate(octokit.rest.issues.listForRepo, {
    owner,
    repo,
    state: 'all',
    per_page: 100
  })

  for (const issue of issuesData) {
    // Skip pull requests (they come from pulls API)
    if (issue.pull_request) continue
    issueCount++

    // Ensure author exists as shadow user
    if (issue.user) {
      await ensureUser({
        id: issue.user.id,
        login: issue.user.login,
        avatar_url: issue.user.avatar_url
      })
    }

    const [existingIssue] = await db.select().from(schema.issues).where(eq(schema.issues.id, issue.id))

    const milestoneId = issue.milestone?.id ?? null

    const issueData = {
      type: 'issue' as const,
      repositoryId,
      milestoneId,
      userId: issue.user?.id,
      number: issue.number,
      title: issue.title,
      body: issue.body,
      state: issue.state,
      stateReason: issue.state_reason,
      htmlUrl: issue.html_url,
      locked: issue.locked,
      closedAt: issue.closed_at ? new Date(issue.closed_at) : null,
      updatedAt: new Date()
    }

    if (existingIssue) {
      await db.update(schema.issues).set(issueData).where(eq(schema.issues.id, issue.id))
    } else {
      await db.insert(schema.issues).values({
        id: issue.id,
        ...issueData
      })
    }

    // Subscribe issue author to the issue
    if (issue.user?.id) {
      await subscribeUserToIssue(issue.id, issue.user.id)
    }

    // Sync assignees
    await syncIssueAssignees(issue.id, issue.assignees || [])

    // Sync labels
    const labelIds = issue.labels
      .filter((l): l is { id: number } => typeof l === 'object' && 'id' in l)
      .map(l => l.id)
    await syncIssueLabels(issue.id, labelIds)
  }

  // Sync pull requests
  const prsData = await octokit.paginate(octokit.rest.pulls.list, {
    owner,
    repo,
    state: 'all',
    per_page: 100
  })

  for (const pr of prsData) {
    prCount++

    // Ensure author exists as shadow user
    if (pr.user) {
      await ensureUser({
        id: pr.user.id,
        login: pr.user.login,
        avatar_url: pr.user.avatar_url
      })
    }

    const [existingPR] = await db.select().from(schema.issues).where(eq(schema.issues.id, pr.id))

    const milestoneId = pr.milestone?.id ?? null

    const prData = {
      type: 'pull_request' as const,
      repositoryId,
      milestoneId,
      userId: pr.user?.id,
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
      updatedAt: new Date()
    }

    if (existingPR) {
      await db.update(schema.issues).set(prData).where(eq(schema.issues.id, pr.id))
    } else {
      await db.insert(schema.issues).values({
        id: pr.id,
        ...prData
      })
    }

    // Subscribe PR author to the PR
    if (pr.user?.id) {
      await subscribeUserToIssue(pr.id, pr.user.id)
    }

    // Sync assignees
    await syncIssueAssignees(pr.id, pr.assignees || [])

    // Sync labels
    await syncIssueLabels(pr.id, pr.labels.map(l => l.id))

    // Sync requested reviewers
    const reviewers = (pr.requested_reviewers as any[])?.filter(r => r.id) || []
    await syncIssueRequestedReviewers(pr.id, reviewers)
  }

  return { issues: issueCount, pullRequests: prCount }
}

// Helper: sync issue assignees
async function syncIssueAssignees(issueId: number, assignees: { id: number, login: string, avatar_url: string }[]) {
  // Delete existing assignees
  await db.delete(schema.issueAssignees).where(eq(schema.issueAssignees.issueId, issueId))

  // Insert new assignees
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

    // Auto-subscribe assignee to the issue
    await subscribeUserToIssue(issueId, assignee.id)
  }
}

// Helper: sync issue labels
async function syncIssueLabels(issueId: number, labelIds: number[]) {
  // Delete existing labels
  await db.delete(schema.issueLabels).where(eq(schema.issueLabels.issueId, issueId))

  // Insert new labels
  for (const labelId of labelIds) {
    await db.insert(schema.issueLabels).values({
      issueId,
      labelId
    })
  }
}

// Helper: sync issue requested reviewers
async function syncIssueRequestedReviewers(issueId: number, reviewers: { id: number, login: string, avatar_url?: string }[]) {
  // Delete existing reviewers
  await db.delete(schema.issueRequestedReviewers).where(eq(schema.issueRequestedReviewers.issueId, issueId))

  // Insert new reviewers
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

    // Auto-subscribe reviewer to the PR
    await subscribeUserToIssue(issueId, reviewer.id)
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
    // Fetch collaborators with write access or higher
    const { data: collaborators } = await octokit.rest.repos.listCollaborators({
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

    // Subscribe each maintainer to the repository
    for (const maintainer of maintainers) {
      // Skip if already subscribed
      if (subscribedUserIds.has(maintainer.id)) continue

      try {
        // Ensure user exists as shadow user (so foreign key works)
        await ensureUser({
          id: maintainer.id,
          login: maintainer.login,
          avatar_url: maintainer.avatar_url
        })

        await db.insert(schema.repositorySubscriptions).values({
          userId: maintainer.id,
          repositoryId,
          issues: true,
          pullRequests: true,
          mentions: true,
          activity: false
        })
      } catch (error) {
        console.warn(`[sync] Failed to subscribe maintainer ${maintainer.login}:`, error)
      }
    }

    return maintainers.length
  } catch (error) {
    console.warn(`[sync] Failed to sync collaborators for ${owner}/${repo}:`, error)
    return 0
  }
}
