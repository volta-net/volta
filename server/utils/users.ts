import { eq, and } from 'drizzle-orm'
import { db, schema } from 'hub:db'

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
 * Does NOT update registered users to preserve their data.
 */
export async function ensureUser(user: GitHubUser) {
  try {
    const existing = await db.query.users.findFirst({
      where: eq(schema.users.id, user.id)
    })

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
