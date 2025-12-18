import { eq, and } from 'drizzle-orm'
import { db, schema } from 'hub:db'
import { Octokit } from 'octokit'
import { ensureUser } from './users'

// Helper: ensure type exists in the database
export async function ensureType(repositoryId: number, type: { id: number, name: string, color?: string | null, description?: string | null }) {
  const [existing] = await db
    .select()
    .from(schema.types)
    .where(eq(schema.types.id, type.id))

  if (existing) {
    // Update if name/color/description changed
    await db.update(schema.types).set({
      name: type.name,
      color: type.color ?? null,
      description: type.description ?? null,
      updatedAt: new Date()
    }).where(eq(schema.types.id, type.id))
  } else {
    await db.insert(schema.types).values({
      id: type.id,
      repositoryId,
      name: type.name,
      color: type.color ?? null,
      description: type.description ?? null
    })
  }

  return type.id
}

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

export async function syncTypes(accessToken: string, owner: string, repo: string, repositoryId: number) {
  const octokit = new Octokit({ auth: accessToken })

  try {
    // GitHub issue types API (may not be available for all repositories)
    const { data: typesData } = await octokit.request('GET /repos/{owner}/{repo}/issue-types', {
      owner,
      repo
    })

    for (const type of typesData) {
      const [existingType] = await db.select().from(schema.types).where(eq(schema.types.id, type.id))

      if (existingType) {
        await db.update(schema.types).set({
          name: type.name,
          description: type.description,
          color: type.color,
          updatedAt: new Date()
        }).where(eq(schema.types.id, type.id))
      } else {
        await db.insert(schema.types).values({
          id: type.id,
          repositoryId,
          name: type.name,
          description: type.description,
          color: type.color
        })
      }
    }

    return typesData.length
  } catch (error: any) {
    // Issue types API may not be available for all repositories
    if (error.status === 404) {
      console.log(`[Sync] Issue types not available for ${owner}/${repo}`)
      return 0
    }
    throw error
  }
}

export async function syncIssues(accessToken: string, owner: string, repo: string, repositoryId: number) {
  const octokit = new Octokit({ auth: accessToken })

  let issueCount = 0
  let prCount = 0

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

    // Ensure author exists as shadow user
    if (issue.user) {
      await ensureUser({
        id: issue.user.id,
        login: issue.user.login,
        avatar_url: issue.user.avatar_url
      })
    }

    // Look up by repositoryId + number (unique) instead of id
    // because GitHub returns different IDs from issues vs pulls API
    const [existingIssue] = await db.select().from(schema.issues).where(
      and(
        eq(schema.issues.repositoryId, repositoryId),
        eq(schema.issues.number, issue.number)
      )
    )

    const issueData = {
      pullRequest: false,
      repositoryId,
      typeId: issue.type?.id,
      userId: issue.user?.id,
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

    if (existingIssue) {
      await db.update(schema.issues).set(issueData).where(eq(schema.issues.id, existingIssue.id))
    } else {
      await db.insert(schema.issues).values({
        id: issue.id,
        ...issueData
      })
    }

    const issueId = existingIssue?.id ?? issue.id

    // Subscribe issue author to the issue
    if (issue.user?.id) {
      await subscribeUserToIssue(issueId, issue.user.id)
    }

    // Sync assignees
    await syncIssueAssignees(issueId, issue.assignees || [])

    // Sync labels
    const labelIds = issue.labels
      .filter((l): l is { id: number } => typeof l === 'object' && 'id' in l)
      .map(l => l.id)
    await syncIssueLabels(issueId, labelIds)

    // Sync comments
    await syncIssueComments(octokit, owner, repo, issue.number, issueId)

    // Mark as synced
    await db.update(schema.issues).set({ synced: true, syncedAt: new Date() }).where(eq(schema.issues.id, issueId))
  }

  // Sync only open pull requests (closed/merged PRs are imported via webhooks/notifications)
  const prsData = await octokit.paginate(octokit.rest.pulls.list, {
    owner,
    repo,
    state: 'open',
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

    // Look up by repositoryId + number (unique) instead of id
    // because GitHub returns different IDs from issues vs pulls API
    const [existingPR] = await db.select().from(schema.issues).where(
      and(
        eq(schema.issues.repositoryId, repositoryId),
        eq(schema.issues.number, pr.number)
      )
    )

    const milestoneId = pr.milestone?.id ?? null

    const prData = {
      pullRequest: true,
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
      // Engagement metrics (reactions not available in pulls.list, will be updated via webhooks)
      reactionCount: 0,
      commentCount: 0,
      // Use GitHub timestamps
      createdAt: new Date(pr.created_at),
      updatedAt: new Date(pr.updated_at)
    }

    if (existingPR) {
      await db.update(schema.issues).set(prData).where(eq(schema.issues.id, existingPR.id))
    } else {
      await db.insert(schema.issues).values({
        id: pr.id,
        ...prData
      })
    }

    const prId = existingPR?.id ?? pr.id

    // Subscribe PR author to the PR
    if (pr.user?.id) {
      await subscribeUserToIssue(prId, pr.user.id)
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

    // Mark as synced
    await db.update(schema.issues).set({ synced: true, syncedAt: new Date() }).where(eq(schema.issues.id, prId))
  }

  return { issues: issueCount, pullRequests: prCount }
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

  // Insert new labels
  for (const labelId of labelIds) {
    if (!existingIds.has(labelId)) {
      await db.insert(schema.issueLabels).values({
        issueId,
        labelId
      })
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

    console.log(`[Sync] Synced ${comments.length} comments for issue #${issueNumber}`)
  } catch (error) {
    console.error(`[Sync] Failed to sync comments for issue #${issueNumber}:`, error)
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

    // Get existing collaborators
    const existingCollaborators = await db
      .select()
      .from(schema.repositoryCollaborators)
      .where(eq(schema.repositoryCollaborators.repositoryId, repositoryId))

    const existingCollaboratorIds = new Set(existingCollaborators.map(c => c.userId))
    const newCollaboratorIds = new Set(maintainers.map(m => m.id))

    // Delete collaborators that are no longer maintainers
    for (const existing of existingCollaborators) {
      if (!newCollaboratorIds.has(existing.userId)) {
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
        // Ensure user exists as shadow user (so foreign key works)
        await ensureUser({
          id: maintainer.id,
          login: maintainer.login,
          avatar_url: maintainer.avatar_url
        })

        // Determine permission level
        const permission = maintainer.permissions?.admin
          ? 'admin'
          : maintainer.permissions?.maintain
            ? 'maintain'
            : 'write'

        // Insert or update collaborator
        if (existingCollaboratorIds.has(maintainer.id)) {
          await db.update(schema.repositoryCollaborators).set({
            permission,
            updatedAt: new Date()
          }).where(
            and(
              eq(schema.repositoryCollaborators.repositoryId, repositoryId),
              eq(schema.repositoryCollaborators.userId, maintainer.id)
            )
          )
        } else {
          await db.insert(schema.repositoryCollaborators).values({
            repositoryId,
            userId: maintainer.id,
            permission
          })
        }

        // Subscribe if not already subscribed
        if (!subscribedUserIds.has(maintainer.id)) {
          await db.insert(schema.repositorySubscriptions).values({
            userId: maintainer.id,
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
