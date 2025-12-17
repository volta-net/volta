import { eq, and, inArray, desc, notInArray } from 'drizzle-orm'
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

  // Get open PRs that are not drafts
  const openPRs = await db
    .select({
      id: schema.issues.id,
      type: schema.issues.type,
      number: schema.issues.number,
      title: schema.issues.title,
      state: schema.issues.state,
      draft: schema.issues.draft,
      htmlUrl: schema.issues.htmlUrl,
      headSha: schema.issues.headSha,
      createdAt: schema.issues.createdAt,
      updatedAt: schema.issues.updatedAt,
      repository: {
        id: schema.repositories.id,
        name: schema.repositories.name,
        fullName: schema.repositories.fullName
      },
      author: {
        id: schema.users.id,
        login: schema.users.login,
        avatarUrl: schema.users.avatarUrl
      }
    })
    .from(schema.issues)
    .innerJoin(schema.repositories, eq(schema.issues.repositoryId, schema.repositories.id))
    .leftJoin(schema.users, eq(schema.issues.userId, schema.users.id))
    .where(and(
      eq(schema.issues.type, 'pull_request'),
      eq(schema.issues.state, 'open'),
      eq(schema.issues.draft, false),
      inArray(schema.issues.repositoryId, favoriteRepoIds)
    ))
    .orderBy(desc(schema.issues.updatedAt))

  // For each PR, check if it has approvals and no changes requested, and CI is passing
  const readyToMerge = await Promise.all(
    openPRs.map(async (pr) => {
      // Get the latest review state for each reviewer
      const reviews = await db
        .select({
          state: schema.issueReviews.state,
          submittedAt: schema.issueReviews.submittedAt
        })
        .from(schema.issueReviews)
        .where(eq(schema.issueReviews.issueId, pr.id))
        .orderBy(desc(schema.issueReviews.submittedAt))

      // Check if there are any CHANGES_REQUESTED that haven't been superseded
      const hasChangesRequested = reviews.some(r => r.state === 'CHANGES_REQUESTED')
      const hasApproval = reviews.some(r => r.state === 'APPROVED')

      // If changes requested or no approval, skip
      if (hasChangesRequested || !hasApproval) {
        return null
      }

      // Check CI status
      const [latestRun] = await db
        .select({
          id: schema.workflowRuns.id,
          status: schema.workflowRuns.status,
          conclusion: schema.workflowRuns.conclusion
        })
        .from(schema.workflowRuns)
        .where(and(
          eq(schema.workflowRuns.repositoryId, pr.repository.id),
          eq(schema.workflowRuns.headSha, pr.headSha || '')
        ))
        .orderBy(desc(schema.workflowRuns.createdAt))
        .limit(1)

      // Only include if CI passed (or no CI configured)
      if (latestRun && latestRun.conclusion !== 'success') {
        return null
      }

      return {
        ...pr,
        ciStatus: latestRun || null
      }
    })
  )

  return readyToMerge.filter((pr): pr is NonNullable<typeof pr> => pr !== null).slice(0, 10)
})
