import { eq, and } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'

/**
 * Check if a user is a collaborator (has write access) to a repository
 */
export async function isRepositoryCollaborator(userId: number, repositoryId: number): Promise<boolean> {
  const collaborator = await db.query.repositoryCollaborators.findFirst({
    where: and(
      eq(schema.repositoryCollaborators.repositoryId, repositoryId),
      eq(schema.repositoryCollaborators.userId, userId)
    )
  })

  return !!collaborator
}

/**
 * Require user to be a collaborator of the repository, throws 403 if not
 */
export async function requireRepositoryAccess(userId: number, repositoryId: number): Promise<void> {
  const isCollaborator = await isRepositoryCollaborator(userId, repositoryId)

  if (!isCollaborator) {
    throw createError({
      statusCode: 403,
      message: 'You do not have access to this repository'
    })
  }
}

/**
 * Get a subquery for favorite repository IDs that the user has collaborator access to.
 * Use with inArray() for single-query filtering.
 */
export function getUserFavoriteRepoIdsSubquery(userId: number) {
  return db
    .select({ id: schema.favoriteRepositories.repositoryId })
    .from(schema.favoriteRepositories)
    .innerJoin(
      schema.repositoryCollaborators,
      and(
        eq(schema.repositoryCollaborators.repositoryId, schema.favoriteRepositories.repositoryId),
        eq(schema.repositoryCollaborators.userId, userId)
      )
    )
    .where(eq(schema.favoriteRepositories.userId, userId))
}

/**
 * Get favorite repository IDs that the user has collaborator access to (executes query)
 */
export async function getUserFavoriteRepoIds(userId: number): Promise<number[]> {
  const favoriteRepos = await getUserFavoriteRepoIdsSubquery(userId)
  return favoriteRepos.map(f => f.id)
}

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
 * Updates shadow users with latest info, but does NOT update registered users.
 * Returns the internal database ID.
 */
export async function ensureUser(user: GitHubUser): Promise<number | null> {
  try {
    // Use upsert to avoid race conditions when multiple webhooks process the same user
    // Only update shadow users (registered = false) to preserve registered user data
    const [result] = await db.insert(schema.users).values({
      githubId: user.id,
      login: user.login,
      avatarUrl: user.avatar_url,
      name: user.name,
      email: user.email,
      registered: false // Shadow user
    }).onConflictDoUpdate({
      target: schema.users.githubId,
      set: {
        login: user.login,
        avatarUrl: user.avatar_url,
        name: user.name,
        email: user.email,
        updatedAt: new Date()
      },
      // Only update if user is a shadow user (not registered)
      setWhere: eq(schema.users.registered, false)
    }).returning({ id: schema.users.id })

    // If result is undefined, the user is registered and the setWhere condition wasn't met
    // In this case, fetch the existing user's ID
    if (!result) {
      const [existingUser] = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.githubId, user.id))
      return existingUser?.id ?? null
    }

    return result.id
  } catch (error) {
    console.debug('[users] Failed to ensure user:', user.id, error)
    return null
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

/**
 * Get the internal database user ID from a GitHub user ID.
 */
export async function getDbUserId(githubUserId: number): Promise<number | null> {
  try {
    const [user] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.githubId, githubUserId))
    return user?.id ?? null
  } catch (error) {
    console.error('[users] Failed to get user ID:', error)
    return null
  }
}

/**
 * Get the internal database repository ID from a GitHub repository ID.
 */
export async function getDbRepositoryId(githubRepoId: number): Promise<number | null> {
  try {
    const [repo] = await db
      .select({ id: schema.repositories.id })
      .from(schema.repositories)
      .where(eq(schema.repositories.githubId, githubRepoId))
    return repo?.id ?? null
  } catch (error) {
    console.error('[users] Failed to get repository ID:', error)
    return null
  }
}

/**
 * Get the internal database installation ID from a GitHub installation ID.
 */
export async function getDbInstallationId(githubInstallationId: number): Promise<number | null> {
  try {
    const [installation] = await db
      .select({ id: schema.installations.id })
      .from(schema.installations)
      .where(eq(schema.installations.githubId, githubInstallationId))
    return installation?.id ?? null
  } catch (error) {
    console.error('[users] Failed to get installation ID:', error)
    return null
  }
}
