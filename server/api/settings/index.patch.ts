import { eq } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  const body = await readBody<{
    aiGatewayToken?: string | null
  }>(event)

  // Update user settings
  const updateData: Record<string, unknown> = {
    updatedAt: new Date()
  }

  // Allow setting or clearing the token
  if ('aiGatewayToken' in body) {
    // Encrypt the token before storing, or set to null if clearing
    updateData.aiGatewayToken = body.aiGatewayToken
      ? encrypt(body.aiGatewayToken)
      : null
  }

  await db.update(schema.users)
    .set(updateData)
    .where(eq(schema.users.id, user.id))

  return {
    success: true,
    hasAiGatewayToken: !!body.aiGatewayToken
  }
})
