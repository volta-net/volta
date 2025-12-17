import { eq, and, inArray, desc } from 'drizzle-orm'
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

  // Get open PRs
  const openPRs = await db
    .select({
      id: schema.issues.id,
      type: schema.issues.type,
      number: schema.issues.number,
      title: schema.issues.title,
      state: schema.issues.state,
      draft: schema.issues.draft,
      htmlUrl: schema.issues.htmlUrl,
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
      inArray(schema.issues.repositoryId, favoriteRepoIds)
    ))
    .orderBy(desc(schema.issues.updatedAt))

  // For each PR, check if the latest review state is CHANGES_REQUESTED
  const waitingOnAuthor = await Promise.all(
    openPRs.map(async (pr) => {
      // Get the latest review for this PR
      const [latestReview] = await db
        .select({
          state: schema.issueReviews.state,
          submittedAt: schema.issueReviews.submittedAt,
          reviewer: {
            id: schema.users.id,
            login: schema.users.login,
            avatarUrl: schema.users.avatarUrl
          }
        })
        .from(schema.issueReviews)
        .leftJoin(schema.users, eq(schema.issueReviews.userId, schema.users.id))
        .where(eq(schema.issueReviews.issueId, pr.id))
        .orderBy(desc(schema.issueReviews.submittedAt))
        .limit(1)

      // Only include if the latest review is CHANGES_REQUESTED
      if (!latestReview || latestReview.state !== 'CHANGES_REQUESTED') {
        return null
      }

      return {
        ...pr,
        latestReview: {
          state: latestReview.state,
          reviewer: latestReview.reviewer
        }
      }
    })
  )

  return waitingOnAuthor.filter((pr): pr is NonNullable<typeof pr> => pr !== null).slice(0, 10)
})
