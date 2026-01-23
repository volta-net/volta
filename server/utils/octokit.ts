import type { H3Event } from 'h3'
import { Octokit } from 'octokit'
import { createAppAuth } from '@octokit/auth-app'

let _octokit: Octokit | null = null

export function useOctokit() {
  if (_octokit) {
    return _octokit
  }

  const config = useRuntimeConfig()

  _octokit = new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: config.github.appId,
      privateKey: config.github.privateKey,
      clientId: config.oauth.github.clientId,
      clientSecret: config.oauth.github.clientSecret
    }
  })

  return _octokit
}

export async function useOctokitAsInstallation(installationId: number): Promise<Octokit> {
  const octokit = useOctokit()

  const auth = await octokit.auth({
    type: 'installation',
    installationId
  }) as { token: string }

  return useOctokitWithToken(auth.token)
}

export function useOctokitWithToken(token: string) {
  return new Octokit({
    auth: token
  })
}

/**
 * Verify if a user has GitHub access to a repository.
 * Uses the user's token to check if they can access the repo via GitHub's API.
 * Returns true if they have any level of access (read, triage, write, maintain, admin).
 */
export async function verifyGitHubRepoAccess(accessToken: string, owner: string, repo: string): Promise<boolean> {
  try {
    const octokit = useOctokitWithToken(accessToken)
    // Try to get the repository - this will fail with 404 if user has no access
    await octokit.rest.repos.get({ owner, repo })
    return true
  } catch (error: any) {
    // 404 means no access, 403 means rate limited or blocked
    if (error.status === 404 || error.status === 403) {
      return false
    }
    // For other errors, log and deny access to be safe
    console.warn(`[octokit] Failed to verify repo access for ${owner}/${repo}:`, error.message)
    return false
  }
}

/**
 * Get a valid access token, refreshing if necessary.
 * Returns the access token from the session, refreshing it if expired.
 */
export async function getValidAccessToken(event: H3Event): Promise<string> {
  const session = await getUserSession(event)
  const { secure } = session

  if (!secure?.accessToken) {
    throw createError({ statusCode: 401, message: 'Not authenticated' })
  }

  // Check if token is expired or will expire in the next 5 minutes
  const bufferTime = 5 * 60 * 1000 // 5 minutes
  const isExpired = secure.expiresAt && Date.now() > (secure.expiresAt - bufferTime)

  if (!isExpired) {
    return secure.accessToken
  }

  // Token is expired, try to refresh
  if (!secure.refreshToken) {
    throw createError({
      statusCode: 401,
      message: 'Session expired. Please log in again.'
    })
  }

  console.log('[auth] Access token expired, refreshing...')

  const config = useRuntimeConfig()

  try {
    const response = await $fetch<{
      access_token: string
      refresh_token: string
      expires_in: number
      token_type: string
    }>('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: {
        client_id: config.oauth.github.clientId,
        client_secret: config.oauth.github.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: secure.refreshToken
      }
    })

    if (!response.access_token) {
      throw new Error('No access token in response')
    }

    // Calculate new expiry time
    const expiresAt = response.expires_in
      ? Date.now() + (response.expires_in * 1000)
      : undefined

    // Update session with new tokens
    await setUserSession(event, {
      user: session.user,
      secure: {
        accessToken: response.access_token,
        refreshToken: response.refresh_token || secure.refreshToken,
        expiresAt
      }
    })

    console.log('[auth] Token refreshed successfully')
    return response.access_token
  } catch (error) {
    console.error('[auth] Failed to refresh token:', error)
    // Clear the session on refresh failure
    await clearUserSession(event)
    throw createError({
      statusCode: 401,
      message: 'Session expired. Please log in again.'
    })
  }
}
