import { and, inArray, eq, desc, gt } from 'drizzle-orm'
import { db, schema } from 'hub:db'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  const favoriteRepoIds = await getUserFavoriteRepoIds(user!.id)
  if (favoriteRepoIds.length === 0) return []

  // Get collaborators for all favorite repos (batch query)
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

  // Get open issues with comments, labels, type (single query with relations)
  const issues = await db.query.issues.findMany({
    where: and(
      eq(schema.issues.pullRequest, false),
      eq(schema.issues.state, 'open'),
      inArray(schema.issues.repositoryId, favoriteRepoIds),
      gt(schema.issues.commentCount, 0)
    ),
    orderBy: desc(schema.issues.updatedAt),
    with: {
      repository: true,
      type: true,
      labels: { with: { label: true } },
      comments: {
        orderBy: desc(schema.issueComments.createdAt),
        limit: 1
      }
    }
  })

  const twoDaysAgo = new Date()
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)

  // Filter to issues where last comment is from a maintainer (older than 2 days)
  return issues
    .filter((issue) => {
      const repoCollaborators = collaboratorsByRepo.get(issue.repositoryId)
      if (!repoCollaborators?.size) return false

      const lastComment = issue.comments[0]
      console.log(lastComment)
      if (!lastComment?.userId) return false

      // Check if commenter is a collaborator
      if (!repoCollaborators.has(lastComment.userId)) return false

      // Skip if recent (give author time to respond)
      // if (lastComment.createdAt && lastComment.createdAt > twoDaysAgo) return false

      return true
    })
    .map(issue => ({
      ...issue,
      labels: issue.labels.map(l => l.label)
    }))
})
