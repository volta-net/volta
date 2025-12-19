import { and, inArray, notInArray, eq, desc, ilike } from 'drizzle-orm'
import { db, schema } from 'hub:db'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  const favoriteRepoIdsSubquery = getUserFavoriteRepoIdsSubquery(user!.id)

  // Bot users subquery
  const botUserIdsSubquery = db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(ilike(schema.users.login, '%[bot]%'))

  // Collaborator user IDs for favorite repos (needed for filtering)
  const collaborators = await db
    .select({ userId: schema.repositoryCollaborators.userId })
    .from(schema.repositoryCollaborators)
    .where(inArray(schema.repositoryCollaborators.repositoryId, favoriteRepoIdsSubquery))

  const maintainerIds = new Set(collaborators.map(c => c.userId))

  // Get open issues with labels and comments
  const issues = await db.query.issues.findMany({
    where: and(
      eq(schema.issues.pullRequest, false),
      eq(schema.issues.state, 'open'),
      inArray(schema.issues.repositoryId, favoriteRepoIdsSubquery),
      notInArray(schema.issues.userId, botUserIdsSubquery)
    ),
    orderBy: desc(schema.issues.updatedAt),
    with: {
      repository: true,
      user: true,
      type: true,
      labels: { with: { label: true } },
      comments: true
    }
  })

  // Filter to issues that need triage:
  // 1. Has a label containing "triage" (case insensitive)
  // 2. OR hasn't been answered by a maintainer (no comments from any maintainer)
  // 3. BUT exclude issues answered by a maintainer even if they have a triage label
  return issues
    .filter((issue) => {
      // Check if any maintainer has commented
      const hasMaintainerComment = issue.comments.some(c =>
        c.userId && maintainerIds.has(c.userId)
      )

      // Exclude issues answered by a maintainer (even with triage label)
      if (hasMaintainerComment) return false

      // Include: has triage label or no maintainer has commented yet
      return true
    })
    .map(issue => ({
      ...issue,
      labels: issue.labels.map(l => l.label)
    }))
})
