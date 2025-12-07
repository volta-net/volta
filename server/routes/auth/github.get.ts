import { eq } from 'drizzle-orm'
import { db, schema } from 'hub:db'

export default defineOAuthGitHubEventHandler({
  config: {
    scope: ['notifications']
  },
  async onSuccess(event, { user, tokens }) {
    // Upsert user in database
    try {
      const [existingUser] = await db.select().from(schema.users).where(eq(schema.users.id, user.id))

      if (existingUser) {
        await db.update(schema.users).set({
          login: user.login,
          name: user.name,
          email: user.email,
          avatarUrl: user.avatar_url,
          registered: true, // Mark as registered on login
          updatedAt: new Date()
        }).where(eq(schema.users.id, user.id))
      } else {
        await db.insert(schema.users).values({
          id: user.id,
          login: user.login,
          name: user.name,
          email: user.email,
          avatarUrl: user.avatar_url,
          registered: true // Mark as registered on login
        })
      }
    } catch (error) {
      console.warn('[auth] Failed to save user to database:', error)
    }

    // Calculate token expiry (GitHub tokens expire in 8 hours = 28800 seconds)
    const expiresAt = tokens.expires_in
      ? Date.now() + (tokens.expires_in * 1000)
      : undefined

    await setUserSession(event, {
      user: {
        id: user.id,
        username: user.login,
        avatar: user.avatar_url
      },
      secure: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt
      }
    })

    return sendRedirect(event, '/')
  }
})
