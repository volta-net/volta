export default defineEventHandler(async (event) => {
  const { payload, event: githubEvent, deliveryId } = await parseWebhookEvent(event)

  console.log(`[Webhook] Received ${githubEvent} event (${deliveryId})`)

  try {
    switch (githubEvent) {
      case 'ping':
        return { message: 'pong' }

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
        console.log(`[Webhook] Installation target ${payload.action}: ${payload.account?.login}`)
        break

      case 'meta':
        console.log(`[Webhook] Meta ${payload.action}: hook ${payload.hook?.id}`)
        break

      // Issue events
      case 'issues':
        await handleIssueEvent(payload.action, payload.issue, payload.repository, payload.installation?.id)
        // Create notifications
        if (payload.action === 'opened') {
          await notifyIssueOpened(
            payload.issue,
            payload.repository,
            payload.sender,
            payload.installation?.id
          )
        }
        if (payload.action === 'reopened') {
          await notifyIssueReopened(
            payload.issue,
            payload.repository,
            payload.sender
          )
        }
        if (payload.action === 'closed') {
          await notifyIssueClosed(
            payload.issue,
            payload.repository,
            payload.sender
          )
        }
        if (payload.action === 'assigned' && payload.assignee) {
          await notifyIssueAssigned(
            payload.issue,
            payload.repository,
            payload.assignee,
            payload.sender
          )
          // Auto-subscribe assignee to the issue
          await ensureUser({
            id: payload.assignee.id,
            login: payload.assignee.login,
            avatar_url: payload.assignee.avatar_url
          })
          await subscribeUserToIssue(payload.issue.id, payload.assignee.id)
        }
        break

      case 'issue_comment': {
        // Note: GitHub sends issue_comment for both issues and PRs
        // Check if this is a PR comment (issue.pull_request exists)
        const isPRComment = !!payload.issue?.pull_request
        if (payload.issue) {
          if (isPRComment) {
            await handlePullRequestEvent('edited', payload.issue, payload.repository, payload.installation?.id)
          } else {
            await handleIssueEvent('edited', payload.issue, payload.repository, payload.installation?.id)
          }
        }
        // Sync the comment to our database
        if (payload.comment) {
          await handleCommentEvent(
            payload.action,
            payload.comment,
            payload.issue,
            payload.repository,
            payload.installation?.id
          )
        }
        // Create notification for comment
        if (payload.action === 'created' && payload.comment) {
          if (isPRComment) {
            await notifyPRComment(
              payload.issue,
              payload.comment,
              payload.repository,
              payload.sender
            )
          } else {
            await notifyIssueComment(
              payload.issue,
              payload.comment,
              payload.repository,
              payload.sender
            )
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
        await handlePullRequestEvent(payload.action, payload.pull_request, payload.repository, payload.installation?.id)
        // Create notifications
        if (payload.action === 'opened') {
          await notifyPROpened(
            payload.pull_request,
            payload.repository,
            payload.sender
          )
        }
        if (payload.action === 'reopened') {
          await notifyPRReopened(
            payload.pull_request,
            payload.repository,
            payload.sender
          )
        }
        if (payload.action === 'assigned' && payload.assignee) {
          await notifyPRAssigned(
            payload.pull_request,
            payload.repository,
            payload.assignee,
            payload.sender
          )
          // Auto-subscribe assignee to the PR
          await ensureUser({
            id: payload.assignee.id,
            login: payload.assignee.login,
            avatar_url: payload.assignee.avatar_url
          })
          await subscribeUserToIssue(payload.pull_request.id, payload.assignee.id)
        }
        if (payload.action === 'review_requested' && payload.requested_reviewer) {
          await notifyPRReviewRequested(
            payload.pull_request,
            payload.repository,
            payload.requested_reviewer,
            payload.sender
          )
          // Auto-subscribe requested reviewer to the PR
          await ensureUser({
            id: payload.requested_reviewer.id,
            login: payload.requested_reviewer.login,
            avatar_url: payload.requested_reviewer.avatar_url
          })
          await subscribeUserToIssue(payload.pull_request.id, payload.requested_reviewer.id)
        }
        if (payload.action === 'ready_for_review') {
          await notifyPRReadyForReview(
            payload.pull_request,
            payload.repository,
            payload.sender
          )
        }
        if (payload.action === 'closed') {
          if (payload.pull_request.merged) {
            await notifyPRMerged(
              payload.pull_request,
              payload.repository,
              payload.sender
            )
          } else {
            await notifyPRClosed(
              payload.pull_request,
              payload.repository,
              payload.sender
            )
          }
        }
        break

      case 'pull_request_review':
        // Update PR on review activity
        if (payload.pull_request) {
          await handlePullRequestEvent('edited', payload.pull_request, payload.repository, payload.installation?.id)
        }
        // Sync the review to our database
        if (payload.review) {
          await handleReviewEvent(
            payload.action,
            payload.review,
            payload.pull_request,
            payload.repository,
            payload.installation?.id
          )
        }
        // Create notification for review
        if (payload.action === 'submitted' && payload.review) {
          await notifyPRReviewSubmitted(
            payload.pull_request,
            payload.review,
            payload.repository,
            payload.sender
          )
        }
        if (payload.action === 'dismissed' && payload.review) {
          await notifyPRReviewDismissed(
            payload.pull_request,
            payload.review,
            payload.repository,
            payload.sender
          )
        }
        break

      case 'pull_request_review_comment':
        // Update PR on review activity
        if (payload.pull_request) {
          await handlePullRequestEvent('edited', payload.pull_request, payload.repository, payload.installation?.id)
        }
        // Sync the review comment to our database
        if (payload.comment) {
          await handleReviewCommentEvent(
            payload.action,
            payload.comment,
            payload.pull_request,
            payload.repository,
            payload.installation?.id
          )
        }
        // Create notification for comment
        if (payload.action === 'created' && payload.comment) {
          await notifyPRComment(
            payload.pull_request,
            payload.comment,
            payload.repository,
            payload.sender
          )
        }
        break

      case 'pull_request_review_thread':
        // Update PR on review activity
        if (payload.pull_request) {
          await handlePullRequestEvent('edited', payload.pull_request, payload.repository, payload.installation?.id)
        }
        break

      // Repository events
      case 'repository':
        await handleRepositoryEvent(payload.action, payload.repository)
        break

      case 'push':
        console.log(`[Webhook] Push to ${payload.repository?.full_name}: ${payload.commits?.length || 0} commits`)
        break

      case 'release':
        console.log(`[Webhook] Release ${payload.action}: ${payload.repository?.full_name} ${payload.release?.tag_name}`)
        if (payload.action === 'published' && payload.release) {
          await handleReleaseEvent(payload.action, payload.release, payload.repository)
          await notifyReleasePublished(
            payload.release,
            payload.repository,
            payload.sender
          )
        }
        break

      case 'workflow_run':
        console.log(`[Webhook] Workflow run ${payload.action}: ${payload.workflow_run?.name} (${payload.workflow_run?.conclusion})`)
        if (payload.action === 'completed' && payload.workflow_run) {
          await handleWorkflowRunEvent(payload.action, payload.workflow_run, payload.repository)
          // Only notify on failure
          if (payload.workflow_run.conclusion === 'failure') {
            await notifyWorkflowFailed(
              payload.workflow_run,
              payload.repository,
              payload.sender
            )
          }
        }
        break

      default:
        console.log(`[Webhook] Unhandled event: ${githubEvent}`)
    }

    return { success: true }
  } catch (error) {
    console.error(`[Webhook] Error processing ${githubEvent}:`, error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Webhook processing failed'
    })
  }
})
