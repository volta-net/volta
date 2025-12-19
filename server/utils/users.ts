import { eq, and, inArray, desc } from 'drizzle-orm'
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

/**
 * Batch get labels for multiple issues (single query)
 */
export async function getLabelsForIssues(issueIds: number[]) {
  if (issueIds.length === 0) return new Map<number, { id: number, name: string, color: string }[]>()

  const labels = await db
    .select({
      issueId: schema.issueLabels.issueId,
      id: schema.labels.id,
      name: schema.labels.name,
      color: schema.labels.color
    })
    .from(schema.issueLabels)
    .innerJoin(schema.labels, eq(schema.issueLabels.labelId, schema.labels.id))
    .where(inArray(schema.issueLabels.issueId, issueIds))

  // Group by issue ID
  const labelsByIssue = new Map<number, { id: number, name: string, color: string }[]>()
  for (const label of labels) {
    if (!labelsByIssue.has(label.issueId)) {
      labelsByIssue.set(label.issueId, [])
    }
    labelsByIssue.get(label.issueId)!.push({ id: label.id, name: label.name, color: label.color })
  }

  return labelsByIssue
}

/**
 * Batch get types for multiple issues (single query)
 */
export async function getTypesForIssues(typeIds: number[]) {
  const uniqueIds = [...new Set(typeIds.filter(id => id !== null))] as number[]
  if (uniqueIds.length === 0) return new Map<number, { id: number, name: string, color: string | null }>()

  const typesData = await db
    .select({
      id: schema.types.id,
      name: schema.types.name,
      color: schema.types.color
    })
    .from(schema.types)
    .where(inArray(schema.types.id, uniqueIds))

  return new Map(typesData.map(t => [t.id, t]))
}

/**
 * Batch get CI status for multiple PRs (single query)
 */
export async function getCIStatusForPRs(prs: { repositoryId: number, headSha: string | null }[]) {
  const validPRs = prs.filter(pr => pr.headSha)
  if (validPRs.length === 0) return new Map<string, { id: number, status: string | null, conclusion: string | null, htmlUrl: string | null, name: string | null }>()

  const headShas = validPRs.map(pr => pr.headSha!)

  const runs = await db
    .select({
      id: schema.workflowRuns.id,
      status: schema.workflowRuns.status,
      conclusion: schema.workflowRuns.conclusion,
      htmlUrl: schema.workflowRuns.htmlUrl,
      name: schema.workflowRuns.name,
      headSha: schema.workflowRuns.headSha,
      createdAt: schema.workflowRuns.createdAt
    })
    .from(schema.workflowRuns)
    .where(inArray(schema.workflowRuns.headSha, headShas))
    .orderBy(desc(schema.workflowRuns.createdAt))

  // Keep only the latest run per headSha
  const ciByHeadSha = new Map<string, { id: number, status: string | null, conclusion: string | null, htmlUrl: string | null, name: string | null }>()
  for (const run of runs) {
    if (run.headSha && !ciByHeadSha.has(run.headSha)) {
      ciByHeadSha.set(run.headSha, { id: run.id, status: run.status, conclusion: run.conclusion, htmlUrl: run.htmlUrl, name: run.name })
    }
  }

  return ciByHeadSha
}

/**
 * Enrich issues/PRs with labels, types, and CI status (batch queries)
 */
export async function enrichIssuesWithMetadata<T extends { id: number, repository: { id: number }, headSha?: string | null, typeId?: number | null }>(
  items: T[],
  options: { includeLabels?: boolean, includeType?: boolean, includeCIStatus?: boolean } = {}
) {
  const { includeLabels = true, includeType = false, includeCIStatus = false } = options

  if (items.length === 0) return []

  // Batch fetch all metadata in parallel
  const [labelsByIssue, typesById, ciByHeadSha] = await Promise.all([
    includeLabels ? getLabelsForIssues(items.map(i => i.id)) : Promise.resolve(new Map()),
    includeType ? getTypesForIssues(items.map(i => (i as any).typeId).filter(Boolean)) : Promise.resolve(new Map()),
    includeCIStatus ? getCIStatusForPRs(items.map(i => ({ repositoryId: i.repository.id, headSha: (i as any).headSha }))) : Promise.resolve(new Map())
  ])

  // Merge metadata into items
  return items.map((item) => {
    const enriched: any = { ...item }

    if (includeLabels) {
      enriched.labels = labelsByIssue.get(item.id) || []
    }

    if (includeType && 'typeId' in item && item.typeId) {
      enriched.type = typesById.get(item.typeId) || null
    }

    if (includeCIStatus && 'headSha' in item && item.headSha) {
      enriched.ciStatus = ciByHeadSha.get(item.headSha) || null
    }

    return enriched
  })
}
