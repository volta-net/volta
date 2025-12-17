import { eq, and, inArray, desc, gt } from 'drizzle-orm'
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

  // Get collaborators for all favorite repos (maintainers with write access or higher)
  const collaborators = await db
    .select({
      repositoryId: schema.repositoryCollaborators.repositoryId,
      userId: schema.repositoryCollaborators.userId
    })
    .from(schema.repositoryCollaborators)
    .where(inArray(schema.repositoryCollaborators.repositoryId, favoriteRepoIds))

  // Create a map of repo -> set of collaborator user IDs
  const collaboratorsByRepo = new Map<number, Set<number>>()
  for (const c of collaborators) {
    if (!collaboratorsByRepo.has(c.repositoryId)) {
      collaboratorsByRepo.set(c.repositoryId, new Set())
    }
    collaboratorsByRepo.get(c.repositoryId)!.add(c.userId)
  }

  // Get open issues that have comments (potentially answered)
  const openIssues = await db
    .select({
      id: schema.issues.id,
      type: schema.issues.type,
      number: schema.issues.number,
      title: schema.issues.title,
      state: schema.issues.state,
      htmlUrl: schema.issues.htmlUrl,
      userId: schema.issues.userId,
      repositoryId: schema.issues.repositoryId,
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
      inArray(schema.issues.repositoryId, favoriteRepoIds),
      gt(schema.issues.commentCount, 0)
    ))
    .orderBy(desc(schema.issues.updatedAt))

  // Check if the last comment was from a maintainer (collaborator)
  // This suggests the issue has been answered
  const answeredIssues = await Promise.all(
    openIssues.map(async (issue) => {
      // Get collaborators for this repo
      const repoCollaborators = collaboratorsByRepo.get(issue.repositoryId)
      if (!repoCollaborators || repoCollaborators.size === 0) {
        // No collaborator data, skip this issue
        return null
      }

      // Get the last comment
      const [lastComment] = await db
        .select({
          commentUserId: schema.issueComments.userId,
          createdAt: schema.issueComments.createdAt
        })
        .from(schema.issueComments)
        .where(eq(schema.issueComments.issueId, issue.id))
        .orderBy(desc(schema.issueComments.createdAt))
        .limit(1)

      // Only include if the last comment is from a maintainer (collaborator)
      if (!lastComment || !lastComment.commentUserId || !repoCollaborators.has(lastComment.commentUserId)) {
        return null
      }

      // If the last comment is recent (within 2 days), skip - give author time to respond
      const twoDaysAgo = new Date()
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)
      if (lastComment.createdAt && lastComment.createdAt > twoDaysAgo) {
        return null
      }

      return issue
    })
  )

  return answeredIssues.filter((issue): issue is NonNullable<typeof issue> => issue !== null).slice(0, 10)
})
