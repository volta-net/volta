import { start } from 'workflow/api'
import { handleWebhookWorkflow } from '../workflows/handleWebhook'

export default defineEventHandler(async (event) => {
  const { payload, event: githubEvent, deliveryId } = await parseWebhookEvent(event)

  console.log(`[Webhook] Received ${githubEvent} event (${deliveryId})`)

  // Handle ping immediately (no workflow needed)
  if (githubEvent === 'ping') {
        return { message: 'pong' }
  }

  try {
    // Start the durable workflow to handle the webhook
    // This ensures webhook processing completes even for complex events
    // and responds quickly to GitHub to prevent timeout
    await start(handleWebhookWorkflow, [{
      event: githubEvent,
      deliveryId,
      payload
    }])

    return { success: true }
  } catch (error) {
    console.error(`[Webhook] Error starting workflow for ${githubEvent}:`, error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Webhook processing failed'
    })
  }
})
