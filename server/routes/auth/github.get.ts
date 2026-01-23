import { db, schema } from '@nuxthub/db'

// Extended GitHub tokens type (when token expiration is enabled in GitHub App)
interface GitHubTokensWithRefresh {
  access_token: string
  scope: string
  token_type: string
  // These fields are present when "User-to-server token expiration" is enabled
  refresh_token?: string
  expires_in?: number
  refresh_token_expires_in?: number
}

export default defineOAuthGitHubEventHandler({
  config: {
    scope: ['notifications']
  },
  async onSuccess(event, { user, tokens: _tokens }) {
    // Cast tokens to extended type that includes refresh token fields
    const tokens = _tokens as GitHubTokensWithRefresh

    // Upsert user in database - use upsert to avoid race conditions
    let dbUserId: number
    try {
      const [result] = await db.insert(schema.users).values({
        githubId: user.id,
        login: user.login,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatar_url,
        registered: true // Mark as registered on login
      }).onConflictDoUpdate({
        target: schema.users.githubId,
        set: {
          login: user.login,
          name: user.name,
          email: user.email,
          avatarUrl: user.avatar_url,
          registered: true, // Mark as registered on login
          updatedAt: new Date()
        }
      }).returning({ id: schema.users.id })

      dbUserId = result!.id
    } catch (error) {
      console.warn('[auth] Failed to save user to database:', error)
      throw createError({
        statusCode: 500,
        message: 'Failed to save user to database'
      })
    }

    // Calculate token expiry (GitHub tokens expire in 8 hours = 28800 seconds)
    const expiresAt = tokens.expires_in
      ? Date.now() + (tokens.expires_in * 1000)
      : undefined

    await setUserSession(event, {
      user: {
        id: dbUserId,
        githubId: user.id,
        username: user.login,
        avatar: user.avatar_url,
        registered: true
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
