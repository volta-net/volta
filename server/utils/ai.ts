import { createGateway } from '@ai-sdk/gateway'
import { eq } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import { decrypt, isEncrypted } from './encryption'

/**
 * Get the user's AI Gateway token from the database (decrypted)
 */
export async function getUserAiToken(userId: number): Promise<string | null> {
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
    columns: {
      aiGatewayToken: true
    }
  })

  const encryptedToken = user?.aiGatewayToken
  if (!encryptedToken) {
    return null
  }

  // Decrypt the token before returning
  // Handle legacy unencrypted tokens gracefully
  if (isEncrypted(encryptedToken)) {
    return decrypt(encryptedToken)
  }

  // Return as-is if not encrypted (legacy token)
  return encryptedToken
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
