import { eq } from 'drizzle-orm'
import { db, schema } from 'hub:db'
import { ensureUser } from './users'

// ============================================================================
// Issues
// ============================================================================

export async function handleIssueEvent(action: string, issue: any, repository: any) {
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
      await upsertIssue(issue, repository.id, 'issue')
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

export async function handlePullRequestEvent(action: string, pullRequest: any, repository: any) {
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
      await upsertIssue(pullRequest, repository.id, 'pull_request')
      break
  }
}

// ============================================================================
// Issues (Issues & Pull Requests unified)
// ============================================================================

async function upsertIssue(item: any, repositoryId: number, type: 'issue' | 'pull_request') {
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
  }
}

// Helper: sync issue labels
async function syncIssueLabels(issueId: number, labelIds: number[]) {
  // Delete existing labels
  await db.delete(schema.issueLabels).where(eq(schema.issueLabels.issueId, issueId))

  // Insert new labels (only if label exists in our DB)
  for (const labelId of labelIds) {
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
