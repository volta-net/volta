import { eq } from 'drizzle-orm'
import { db, schema } from 'hub:db'
import { Octokit } from 'octokit'

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
      nodeId: repoData.node_id,
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

  const { data: labelsData } = await octokit.rest.issues.listLabelsForRepo({
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
        nodeId: label.node_id,
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

  const { data: milestonesData } = await octokit.rest.issues.listMilestones({
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
        nodeId: milestone.node_id,
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
  const { data: issuesData } = await octokit.rest.issues.listForRepo({
    owner,
    repo,
    state: 'all',
    per_page: 100
  })

  for (const issue of issuesData) {
    // Skip pull requests (they come from pulls API)
    if (issue.pull_request) continue
    issueCount++

    const [existingIssue] = await db.select().from(schema.issues).where(eq(schema.issues.id, issue.id))

    const milestoneId = issue.milestone?.id ?? null

    const labels = issue.labels
      .filter((l): l is { id: number, name: string, color: string } => typeof l === 'object' && 'id' in l)
      .map(l => ({ id: l.id, name: l.name, color: l.color }))

    const assignees = issue.assignees?.map(a => ({
      login: a.login,
      id: a.id,
      avatar_url: a.avatar_url
    })) || []

    const issueData = {
      type: 'issue' as const,
      repositoryId,
      milestoneId,
      number: issue.number,
      title: issue.title,
      body: issue.body,
      state: issue.state,
      stateReason: issue.state_reason,
      htmlUrl: issue.html_url,
      locked: issue.locked,
      comments: issue.comments,
      userLogin: issue.user?.login,
      userId: issue.user?.id,
      userAvatarUrl: issue.user?.avatar_url,
      assignees,
      labels,
      closedAt: issue.closed_at ? new Date(issue.closed_at) : null,
      updatedAt: new Date()
    }

    if (existingIssue) {
      await db.update(schema.issues).set(issueData).where(eq(schema.issues.id, issue.id))
    } else {
      await db.insert(schema.issues).values({
        id: issue.id,
        nodeId: issue.node_id,
        ...issueData
      })
    }
  }

  // Sync pull requests
  const { data: prsData } = await octokit.rest.pulls.list({
    owner,
    repo,
    state: 'all',
    per_page: 100
  })

  for (const pr of prsData) {
    prCount++

    const [existingPR] = await db.select().from(schema.issues).where(eq(schema.issues.id, pr.id))

    const milestoneId = pr.milestone?.id ?? null
    const labels = pr.labels.map(l => ({ id: l.id, name: l.name, color: l.color }))
    const assignees = pr.assignees?.map(a => ({
      login: a.login,
      id: a.id,
      avatar_url: a.avatar_url
    })) || []
    const requestedReviewers = (pr.requested_reviewers as any[])?.map(r => ({
      login: r.login || r.name,
      id: r.id,
      avatar_url: r.avatar_url || ''
    })) || []

    const prData = {
      type: 'pull_request' as const,
      repositoryId,
      milestoneId,
      number: pr.number,
      title: pr.title,
      body: pr.body,
      state: pr.state,
      htmlUrl: pr.html_url,
      locked: pr.locked,
      userLogin: pr.user?.login,
      userId: pr.user?.id,
      userAvatarUrl: pr.user?.avatar_url,
      assignees,
      labels,
      // PR-specific fields
      draft: pr.draft,
      merged: pr.merged_at !== null,
      headRef: pr.head.ref,
      headSha: pr.head.sha,
      baseRef: pr.base.ref,
      baseSha: pr.base.sha,
      requestedReviewers,
      mergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
      closedAt: pr.closed_at ? new Date(pr.closed_at) : null,
      updatedAt: new Date()
    }

    if (existingPR) {
      await db.update(schema.issues).set(prData).where(eq(schema.issues.id, pr.id))
    } else {
      await db.insert(schema.issues).values({
        id: pr.id,
        nodeId: pr.node_id,
        ...prData
      })
    }
  }

  return { issues: issueCount, pullRequests: prCount }
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
