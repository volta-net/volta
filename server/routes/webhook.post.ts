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
        await handleIssueEvent(payload.action, payload.issue, payload.repository)
        // Create notifications
        if (payload.action === 'opened') {
          await notifyIssueOpened(
            payload.issue,
            payload.repository,
            payload.sender,
            payload.installation?.id
          )
        }
        if (payload.action === 'assigned' && payload.assignee) {
          await notifyIssueAssigned(
            payload.issue,
            payload.repository,
            payload.assignee,
            payload.sender
          )
        }
        break

      case 'issue_comment':
        // Update issue comment count
        if (payload.issue) {
          await handleIssueEvent('edited', payload.issue, payload.repository)
        }
        // Create notification for comment
        if (payload.action === 'created' && payload.comment) {
          await notifyIssueComment(
            payload.issue,
            payload.comment,
            payload.repository,
            payload.sender
          )
        }
        break

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
        await handlePullRequestEvent(payload.action, payload.pull_request, payload.repository)
        // Create notifications
        if (payload.action === 'review_requested' && payload.requested_reviewer) {
          await notifyPRReviewRequested(
            payload.pull_request,
            payload.repository,
            payload.requested_reviewer,
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
          await handlePullRequestEvent('edited', payload.pull_request, payload.repository)
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
        break

      case 'pull_request_review_comment':
        // Update PR on review activity
        if (payload.pull_request) {
          await handlePullRequestEvent('edited', payload.pull_request, payload.repository)
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
          await handlePullRequestEvent('edited', payload.pull_request, payload.repository)
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
