import { eq } from 'drizzle-orm'
import { db, schema } from 'hub:db'

interface GitHubUser {
  id: number
  login: string
  avatar_url?: string
  name?: string
  email?: string
}

/**
 * Ensure a user exists in the database.
 * Creates a shadow user if they don't exist (registered: false).
 * Does NOT update registered users to preserve their data.
 */
export async function ensureUser(user: GitHubUser) {
  try {
    const [existing] = await db.select().from(schema.users).where(eq(schema.users.id, user.id))

    if (!existing) {
      // Create shadow user
      await db.insert(schema.users).values({
        id: user.id,
        login: user.login,
        avatarUrl: user.avatar_url,
        name: user.name,
        email: user.email,
        registered: false // Shadow user
      })
    } else if (!existing.registered) {
      // Update shadow user with latest info
      await db.update(schema.users).set({
        login: user.login,
        avatarUrl: user.avatar_url,
        name: user.name,
        email: user.email,
        updatedAt: new Date()
      }).where(eq(schema.users.id, user.id))
    }
    // Don't update registered users - they have their own data from OAuth
  } catch (error) {
    console.debug('[users] Failed to ensure user:', user.id, error)
  }
}

/**
 * Ensure multiple users exist in the database.
 */
export async function ensureUsers(users: GitHubUser[]) {
  for (const user of users) {
    await ensureUser(user)
  }
}
