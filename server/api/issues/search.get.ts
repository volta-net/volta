import { and, inArray, eq, desc, ilike, or, sql } from 'drizzle-orm'
import { schema } from '@nuxthub/db'

/**
 * Search issues across all repositories the user has access to
 *
 * Query params:
 * - q: string - search term (searches title)
 * - repo: string - optional repository fullName to filter by (e.g., "owner/name")
 * - limit: number - max results (default 10)
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const query = getQuery(event)

  const q = (query.q as string || '').trim()
  const repo = query.repo as string | undefined
  const limit = query.limit ? Math.min(parseInt(query.limit as string, 10), 50) : 10

  // If no search term, return empty
  if (!q) {
    return []
  }

  // Subquery: repositories where user is a collaborator
  const accessibleRepoIds = db
    .select({ repositoryId: schema.repositoryCollaborators.repositoryId })
    .from(schema.repositoryCollaborators)
    .where(eq(schema.repositoryCollaborators.userId, user.id))

  // Search issues by title or number
  const isNumeric = /^\d+$/.test(q)
  const conditions = [
    inArray(schema.issues.repositoryId, accessibleRepoIds)
  ]

  // Filter by specific repository if provided
  if (repo) {
    const repository = await dbs.query.repositories.findFirst({
      where: eq(schema.repositories.fullName, repo),
      columns: { id: true }
    })
    if (repository) {
      conditions.push(eq(schema.issues.repositoryId, repository.id))
    }
  }

  if (isNumeric) {
    // Search by number prefix (e.g., "57" matches 57, 570, 5749) or title containing the number
    conditions.push(or(
      sql`CAST(${schema.issues.number} AS TEXT) LIKE ${q + '%'}`,
      ilike(schema.issues.title, `%${q}%`)
    )!)
  } else {
    // Search by title
    conditions.push(ilike(schema.issues.title, `%${q}%`))
  }

  const issues = await dbs.query.issues.findMany({
    where: and(...conditions),
    orderBy: desc(schema.issues.updatedAt),
    limit,
    with: {
      repository: {
        columns: {
          id: true,
          fullName: true
        }
      },
      user: {
        columns: {
          id: true,
          login: true,
          avatarUrl: true
        }
      }
    },
    columns: {
      id: true,
      number: true,
      title: true,
      state: true,
      pullRequest: true,
      htmlUrl: true,
      updatedAt: true
    }
  })

  return issues
})
