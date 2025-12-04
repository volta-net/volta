import { createHmac, timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'

export function verifyWebhookSignature(body: string, signature: string, secret: string): boolean {
  const hmac = createHmac('sha256', secret)
  const digest = `sha256=${hmac.update(body).digest('hex')}`

  return timingSafeEqual(Buffer.from(digest), Buffer.from(signature))
}

export async function parseWebhookEvent(event: H3Event) {
  const config = useRuntimeConfig()
  const body = await readRawBody(event)
  const signature = getHeader(event, 'x-hub-signature-256')
  const githubEvent = getHeader(event, 'x-github-event')
  const deliveryId = getHeader(event, 'x-github-delivery')

  if (!body || !signature || !githubEvent) {
    throw createError({ statusCode: 400, message: 'Missing required headers or body' })
  }

  if (!verifyWebhookSignature(body, signature, config.github.webhookSecret)) {
    throw createError({ statusCode: 401, message: 'Invalid signature' })
  }

  return {
    payload: JSON.parse(body),
    event: githubEvent,
    deliveryId
  }
}
