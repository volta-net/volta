import { createGateway } from '@ai-sdk/gateway'
import type { GatewayModelId } from '@ai-sdk/gateway'
import { eq } from 'drizzle-orm'
import { schema } from '@nuxthub/db'
import { decrypt, isEncrypted } from './encryption'

// Default AI model to use when none is configured
export const DEFAULT_AI_MODEL = 'anthropic/claude-sonnet-4.5' as GatewayModelId

/**
 * Get the user's AI settings from the database
 */
export async function getUserAiSettings(userId: number): Promise<{ token: string | null, model: GatewayModelId }> {
  const user = await dbs.query.users.findFirst({
    where: eq(schema.users.id, userId),
    columns: {
      aiGatewayToken: true,
      aiModel: true
    }
  })

  const encryptedToken = user?.aiGatewayToken
  let token: string | null = null

  if (encryptedToken) {
    // Decrypt the token before returning
    // Handle legacy unencrypted tokens gracefully
    if (isEncrypted(encryptedToken)) {
      token = decrypt(encryptedToken)
    } else {
      // Return as-is if not encrypted (legacy token)
      token = encryptedToken
    }
  }

  // Use user's selected model or fall back to default
  const model = (user?.aiModel || DEFAULT_AI_MODEL) as GatewayModelId

  return { token, model }
}

/**
 * Get the user's AI Gateway token from the database (decrypted)
 * @deprecated Use getUserAiSettings instead
 */
export async function getUserAiToken(userId: number): Promise<string | null> {
  const { token } = await getUserAiSettings(userId)
  return token
}

/**
 * Create a gateway instance with the user's token
 * Returns null if user has no token configured
 */
export function createUserGateway(token: string | null) {
  if (!token) {
    return null
  }

  return createGateway({
    apiKey: token
  })
}
