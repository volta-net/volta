import { eq, and, inArray, desc, sql } from 'drizzle-orm'
import { db, schema } from 'hub:db'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const userId = user!.id

  const favoriteRepos = await db
    .select({ repositoryId: schema.favoriteRepositories.repositoryId })
    .from(schema.favoriteRepositories)
    .where(eq(schema.favoriteRepositories.userId, userId))

  const favoriteRepoIds = favoriteRepos.map(f => f.repositoryId)

  if (favoriteRepoIds.length === 0) {
    return []
  }

  // Get open issues that have no labels (need triage)
  const openIssues = await db
    .select({
      id: schema.issues.id,
      type: schema.issues.type,
      number: schema.issues.number,
      title: schema.issues.title,
      state: schema.issues.state,
      htmlUrl: schema.issues.htmlUrl,
      reactionCount: schema.issues.reactionCount,
      commentCount: schema.issues.commentCount,
      createdAt: schema.issues.createdAt,
      updatedAt: schema.issues.updatedAt,
      repository: {
        id: schema.repositories.id,
        name: schema.repositories.name,
        fullName: schema.repositories.fullName
      }
    })
    .from(schema.issues)
    .innerJoin(schema.repositories, eq(schema.issues.repositoryId, schema.repositories.id))
    .where(and(
      eq(schema.issues.type, 'issue'),
      eq(schema.issues.state, 'open'),
      inArray(schema.issues.repositoryId, favoriteRepoIds)
    ))
    .orderBy(desc(schema.issues.createdAt))

  // Filter to only issues with no labels
  const issuesWithoutLabels = await Promise.all(
    openIssues.map(async (issue) => {
      const labels = await db
        .select({ labelId: schema.issueLabels.labelId })
        .from(schema.issueLabels)
        .where(eq(schema.issueLabels.issueId, issue.id))
        .limit(1)

      if (labels.length === 0) {
        return issue
      }
      return null
    })
  )

  return issuesWithoutLabels.filter((issue): issue is NonNullable<typeof issue> => issue !== null).slice(0, 10)
})
