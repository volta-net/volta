export interface WebhookInput {
  event: string
  deliveryId: string
  payload: any
}

export interface WebhookResult {
  success: boolean
  event: string
}

// Step function to process the webhook event - uses dynamic imports
async function stepProcessWebhook(githubEvent: string, payload: any) {
  'use step'

  // Dynamic imports to avoid Node.js module issues in workflow context
  const {
    handleInstallationEvent,
    handleInstallationRepositoriesEvent,
    handleIssueEvent,
    handleCommentEvent,
    handleLabelEvent,
    handleMilestoneEvent,
    handlePullRequestEvent,
    handleReviewEvent,
    handleReviewCommentEvent,
    handleRepositoryEvent,
    handleMemberEvent,
    handleReleaseEvent,
    handleWorkflowRunEvent,
    handleCheckRunEvent,
    handleStatusEvent
  } = await import('../utils/webhooks')

  const {
    notifyIssueOpened,
    notifyIssueReopened,
    notifyIssueClosed,
    notifyIssueAssigned,
    notifyIssueComment,
    notifyPROpened,
    notifyPRReopened,
    notifyPRAssigned,
    notifyPRReviewRequested,
    notifyPRReadyForReview,
    notifyPRMerged,
    notifyPRClosed,
    notifyPRComment,
    notifyPRReviewSubmitted,
    notifyPRReviewDismissed,
    notifyReleasePublished,
    notifyWorkflowFailed
  } = await import('../utils/notifications')

  const { triggerResolutionAnalysisOnComment } = await import('../utils/resolution')
  const { ensureUser, getDbRepositoryId } = await import('../utils/users')
  const { getDbIssueId, subscribeUserToIssue } = await import('../utils/sync')

  switch (githubEvent) {
    case 'ping':
      // No-op for ping
      break

    // Installation events
    case 'installation':
      await handleInstallationEvent(
        payload.action,
        payload.installation,
        payload.repositories
      )
      break

    case 'installation_repositories':
      await handleInstallationRepositoriesEvent(
        payload.action,
        payload.installation,
        payload.repositories_added,
        payload.repositories_removed
      )
      break

    case 'installation_target':
    case 'meta':
      // No-op
      break

    // Issue events
    case 'issues':
      await handleIssueEvent(payload.action, payload.issue, payload.repository, payload.installation?.id, payload.sender)
      // Create notifications
      if (payload.action === 'opened') {
        await notifyIssueOpened(payload.issue, payload.repository, payload.sender, payload.installation?.id)
      }
      if (payload.action === 'reopened') {
        await notifyIssueReopened(payload.issue, payload.repository, payload.sender)
      }
      if (payload.action === 'closed') {
        await notifyIssueClosed(payload.issue, payload.repository, payload.sender)
      }
      if (payload.action === 'assigned' && payload.assignee) {
        await notifyIssueAssigned(payload.issue, payload.repository, payload.assignee, payload.sender)
        // Auto-subscribe assignee to the issue
        const assigneeDbId = await ensureUser({
          id: payload.assignee.id,
          login: payload.assignee.login,
          avatar_url: payload.assignee.avatar_url
        })
        const dbRepoId = await getDbRepositoryId(payload.repository.id)
        if (assigneeDbId && dbRepoId) {
          const dbIssueId = await getDbIssueId(dbRepoId, payload.issue.number)
          if (dbIssueId) {
            await subscribeUserToIssue(dbIssueId, assigneeDbId)
          }
        }
      }
      break

    case 'issue_comment': {
      const isPRComment = !!payload.issue?.pull_request
      if (payload.issue && !isPRComment) {
        await handleIssueEvent('edited', payload.issue, payload.repository, payload.installation?.id)
      }
      if (payload.comment) {
        await handleCommentEvent(payload.action, payload.comment, payload.issue, payload.repository, payload.installation?.id)
      }
      if (payload.action === 'created' && payload.comment) {
        if (isPRComment) {
          await notifyPRComment(payload.issue, payload.comment, payload.repository, payload.sender)
        } else {
          await notifyIssueComment(payload.issue, payload.comment, payload.repository, payload.sender)
          triggerResolutionAnalysisOnComment(payload.issue, payload.comment, payload.repository)
        }
      }
      break
    }

    // Label events
    case 'label':
      await handleLabelEvent(payload.action, payload.label, payload.repository)
      break

    // Milestone events
    case 'milestone':
      await handleMilestoneEvent(payload.action, payload.milestone, payload.repository)
      break

    // Pull request events
    case 'pull_request':
      await handlePullRequestEvent(payload.action, payload.pull_request, payload.repository, payload.installation?.id, payload.sender)
      if (payload.action === 'opened') {
        await notifyPROpened(payload.pull_request, payload.repository, payload.sender)
      }
      if (payload.action === 'reopened') {
        await notifyPRReopened(payload.pull_request, payload.repository, payload.sender)
      }
      if (payload.action === 'assigned' && payload.assignee) {
        await notifyPRAssigned(payload.pull_request, payload.repository, payload.assignee, payload.sender)
        const assigneeDbId = await ensureUser({
          id: payload.assignee.id,
          login: payload.assignee.login,
          avatar_url: payload.assignee.avatar_url
        })
        const dbRepoId = await getDbRepositoryId(payload.repository.id)
        if (assigneeDbId && dbRepoId) {
          const dbPrId = await getDbIssueId(dbRepoId, payload.pull_request.number)
          if (dbPrId) {
            await subscribeUserToIssue(dbPrId, assigneeDbId)
          }
        }
      }
      if (payload.action === 'review_requested' && payload.requested_reviewer) {
        await notifyPRReviewRequested(payload.pull_request, payload.repository, payload.requested_reviewer, payload.sender)
        const reviewerDbId = await ensureUser({
          id: payload.requested_reviewer.id,
          login: payload.requested_reviewer.login,
          avatar_url: payload.requested_reviewer.avatar_url
        })
        const dbRepoId = await getDbRepositoryId(payload.repository.id)
        if (reviewerDbId && dbRepoId) {
          const dbPrId = await getDbIssueId(dbRepoId, payload.pull_request.number)
          if (dbPrId) {
            await subscribeUserToIssue(dbPrId, reviewerDbId)
          }
        }
      }
      if (payload.action === 'ready_for_review') {
        await notifyPRReadyForReview(payload.pull_request, payload.repository, payload.sender)
      }
      if (payload.action === 'closed') {
        if (payload.pull_request.merged) {
          await notifyPRMerged(payload.pull_request, payload.repository, payload.sender)
        } else {
          await notifyPRClosed(payload.pull_request, payload.repository, payload.sender)
        }
      }
      break

    case 'pull_request_review':
      if (payload.review) {
        await handleReviewEvent(payload.action, payload.review, payload.pull_request, payload.repository, payload.installation?.id)
      }
      if (payload.action === 'submitted' && payload.review) {
        await notifyPRReviewSubmitted(payload.pull_request, payload.review, payload.repository, payload.sender)
      }
      if (payload.action === 'dismissed' && payload.review) {
        await notifyPRReviewDismissed(payload.pull_request, payload.review, payload.repository, payload.sender)
      }
      break

    case 'pull_request_review_comment':
      if (payload.comment) {
        await handleReviewCommentEvent(payload.action, payload.comment, payload.pull_request, payload.repository, payload.installation?.id)
      }
      if (payload.action === 'created' && payload.comment) {
        await notifyPRComment(payload.pull_request, payload.comment, payload.repository, payload.sender)
      }
      break

    case 'pull_request_review_thread':
      // No-op
      break

    // Repository events
    case 'repository':
      await handleRepositoryEvent(payload.action, payload.repository)
      break

    case 'public':
      await handleRepositoryEvent('publicized', payload.repository)
      break

    // Collaborator events
    case 'member':
      await handleMemberEvent(payload.action, payload.member, payload.repository)
      break

    case 'push':
      // No-op
      break

    case 'release':
      if (payload.action === 'published' && payload.release) {
        await handleReleaseEvent(payload.action, payload.release, payload.repository)
        await notifyReleasePublished(payload.release, payload.repository, payload.sender)
      }
      break

    case 'workflow_run':
      if (payload.action === 'completed' && payload.workflow_run) {
        await handleWorkflowRunEvent(payload.action, payload.workflow_run, payload.repository)
        if (payload.workflow_run.conclusion === 'failure') {
          await notifyWorkflowFailed(payload.workflow_run, payload.repository, payload.sender)
        }
      }
      break

    case 'check_run':
      if (payload.check_run) {
        await handleCheckRunEvent(payload.action, payload.check_run, payload.repository)
      }
      break

    case 'status':
      if (payload.id && payload.sha && payload.context) {
        await handleStatusEvent(payload, payload.repository)
      }
      break

    default:
      console.log(`[Workflow] Unhandled event: ${githubEvent}`)
  }
}

/**
 * Durable workflow to handle GitHub webhook events.
 * Ensures webhook processing completes even for complex events.
 */
export async function handleWebhookWorkflow(input: WebhookInput): Promise<WebhookResult> {
  'use workflow'
  const { event: githubEvent, deliveryId, payload } = input

  console.log(`[Workflow] Processing ${githubEvent} webhook (${deliveryId})`)

  // Process the webhook event in a durable step
  await stepProcessWebhook(githubEvent, payload)

  console.log(`[Workflow] Webhook processing completed for ${githubEvent} (${deliveryId})`)

  return {
    success: true,
    event: githubEvent
  }
}
