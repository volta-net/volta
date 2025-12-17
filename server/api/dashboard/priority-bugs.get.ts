import { eq, and, inArray, desc, or, ilike } from 'drizzle-orm'
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

  // Get bug and priority label IDs
  const bugLabels = await db
    .select({ id: schema.labels.id })
    .from(schema.labels)
    .where(and(
      inArray(schema.labels.repositoryId, favoriteRepoIds),
      or(
        ilike(schema.labels.name, '%bug%'),
        ilike(schema.labels.name, '%priority%'),
        ilike(schema.labels.name, '%critical%'),
        ilike(schema.labels.name, '%urgent%')
      )
    ))

  const bugLabelIds = bugLabels.map(l => l.id)

  if (bugLabelIds.length === 0) {
    return []
  }

  const issuesWithBugLabels = await db
    .selectDistinct({ issueId: schema.issueLabels.issueId })
    .from(schema.issueLabels)
    .where(inArray(schema.issueLabels.labelId, bugLabelIds))

  const bugIssueIds = issuesWithBugLabels.map(i => i.issueId)

  if (bugIssueIds.length === 0) {
    return []
  }

  return db
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
      inArray(schema.issues.id, bugIssueIds),
      inArray(schema.issues.repositoryId, favoriteRepoIds)
    ))
    .orderBy(desc(schema.issues.updatedAt))
    .limit(10)
})
