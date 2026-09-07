import { createGateway } from '@ai-sdk/gateway'
import type { GatewayModelId } from '@ai-sdk/gateway'
import { eq } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import { decrypt, isEncrypted } from './encryption'

// Default AI model to use when none is configured
export const DEFAULT_AI_MODEL = 'anthropic/claude-sonnet-5' as GatewayModelId

type JSONValue = null | string | number | boolean | { [key: string]: JSONValue | undefined } | JSONValue[]
type ProviderOptions = Record<string, Record<string, JSONValue | undefined>>

/**
 * Provider options for a gateway model.
 * 'low' keeps a small reasoning budget and streams reasoning summaries (chat).
 * 'none' turns reasoning off so short completions don't spend their output budget thinking.
 */
export function getAiProviderOptions(model: string, reasoning: 'low' | 'none' = 'low'): ProviderOptions | undefined {
  const gateway = { caching: 'auto' }
  const none = reasoning === 'none'

  switch (model) {
    case 'anthropic/claude-opus-5':
    case 'anthropic/claude-sonnet-5':
      return {
        anthropic: none
          ? { thinking: { type: 'disabled' } }
          : { thinking: { type: 'adaptive', display: 'summarized' }, effort: 'low' },
        gateway
      }
    case 'anthropic/claude-haiku-4.5':
      return none
        ? { gateway }
        : { anthropic: { thinking: { type: 'enabled', budgetTokens: 2048 } }, gateway }
    case 'openai/gpt-5.6-sol':
    case 'openai/gpt-5.6-terra':
    case 'openai/gpt-5.6-luna':
      return {
        openai: none
          ? { reasoningEffort: 'none' }
          : { reasoningEffort: 'low', reasoningSummary: 'detailed' },
        gateway
      }
    case 'google/gemini-3.8-flash':
      return {
        google: { thinkingConfig: { includeThoughts: !none, thinkingLevel: 'low' } },
        gateway
      }
    default:
      return undefined
  }
}

/**
 * Get the user's AI settings from the database
 */
export async function getUserAiSettings(userId: number): Promise<{ token: string | null, model: GatewayModelId }> {
  const user = await db.query.users.findFirst({
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
