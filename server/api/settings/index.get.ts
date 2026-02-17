import { eq } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  const dbUser = await db.query.users.findFirst({
    where: eq(schema.users.id, user.id)
  })

  if (!dbUser) {
    throw createError({ statusCode: 404, message: 'User not found' })
  }

  return {
    // Return whether token is set, not the actual token for security
    hasAiGatewayToken: !!dbUser.aiGatewayToken,
    // Return the user's selected AI model
    aiModel: dbUser.aiModel,
    // Return excluded bots list (parsed from JSON)
    excludedBots: dbUser.excludedBots ? JSON.parse(dbUser.excludedBots) as string[] : []
  }
})
