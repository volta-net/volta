import { eq, and } from 'drizzle-orm'
import { db, schema } from 'hub:db'
import { Octokit } from 'octokit'
import { ensureUser } from '~~/server/utils/users'

export default defineEventHandler(async (event) => {
  const { user, secure } = await requireUserSession(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, message: 'Issue ID is required' })
  }

  const issueId = parseInt(id)

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
      }
    }
  })

  if (!issue) {
    throw createError({ statusCode: 404, message: 'Issue not found' })
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

  // Re-sync issue from GitHub in the background
  syncIssueFromGitHub(secure!.accessToken, issue).catch((err) => {
    console.warn('[issues] Failed to re-sync issue from GitHub:', err)
  })

  // Transform the data for the response
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

    // Sync comments
    await syncComments(accessToken, owner, repo, issue.number, issue.id)
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
