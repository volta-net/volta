import { eq, and, inArray, desc, sql, or, like, ilike } from 'drizzle-orm'
import { db, schema } from 'hub:db'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const userId = user!.id

  // Get user's favorite repositories
  const favoriteRepos = await db
    .select({ repositoryId: schema.favoriteRepositories.repositoryId })
    .from(schema.favoriteRepositories)
    .where(eq(schema.favoriteRepositories.userId, userId))

  const favoriteRepoIds = favoriteRepos.map(f => f.repositoryId)

  // If no favorites, return empty dashboard
  if (favoriteRepoIds.length === 0) {
    return {
      hasFavorites: false,
      myPullRequests: [],
      reviewRequested: [],
      renovatePRs: [],
      hotIssues: [],
      priorityBugs: [],
      assignedToMe: [],
      recommendedToday: []
    }
  }

  // 1. My open PRs (PRs authored by user that are still open)
  const myPullRequests = await db
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
      reactionCount: schema.issues.reactionCount,
      commentCount: schema.issues.commentCount,
      repository: {
        id: schema.repositories.id,
        name: schema.repositories.name,
        fullName: schema.repositories.fullName
      }
    })
    .from(schema.issues)
    .innerJoin(schema.repositories, eq(schema.issues.repositoryId, schema.repositories.id))
    .where(and(
      eq(schema.issues.userId, userId),
      eq(schema.issues.type, 'pull_request'),
      eq(schema.issues.state, 'open'),
      inArray(schema.issues.repositoryId, favoriteRepoIds)
    ))
    .orderBy(desc(schema.issues.updatedAt))
    .limit(10)

  // 2. PRs where my review is requested
  const reviewRequestedPRs = await db
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
    .from(schema.issueRequestedReviewers)
    .innerJoin(schema.issues, eq(schema.issueRequestedReviewers.issueId, schema.issues.id))
    .innerJoin(schema.repositories, eq(schema.issues.repositoryId, schema.repositories.id))
    .leftJoin(schema.users, eq(schema.issues.userId, schema.users.id))
    .where(and(
      eq(schema.issueRequestedReviewers.userId, userId),
      eq(schema.issues.state, 'open'),
      inArray(schema.issues.repositoryId, favoriteRepoIds)
    ))
    .orderBy(desc(schema.issues.updatedAt))
    .limit(10)

  // 3. Renovate/Dependabot PRs with CI status
  // Find PRs from renovate or dependabot users
  const renovatePRs = await db
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
      inArray(schema.issues.repositoryId, favoriteRepoIds),
      or(
        ilike(schema.users.login, '%renovate%'),
        ilike(schema.users.login, '%dependabot%')
      )
    ))
    .orderBy(desc(schema.issues.updatedAt))
    .limit(20)

  // Get CI status for renovate PRs
  const renovatePRsWithCI = await Promise.all(
    renovatePRs.map(async (pr) => {
      // Find the latest workflow run for this PR's head SHA
      const [latestRun] = await db
        .select({
          id: schema.workflowRuns.id,
          status: schema.workflowRuns.status,
          conclusion: schema.workflowRuns.conclusion,
          htmlUrl: schema.workflowRuns.htmlUrl,
          name: schema.workflowRuns.name
        })
        .from(schema.workflowRuns)
        .where(and(
          eq(schema.workflowRuns.repositoryId, pr.repository.id),
          eq(schema.workflowRuns.headSha, pr.headSha || '')
        ))
        .orderBy(desc(schema.workflowRuns.createdAt))
        .limit(1)

      return {
        ...pr,
        ciStatus: latestRun || null
      }
    })
  )

  // 4. Hot issues (high engagement - reactions + comments)
  const hotIssues = await db
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
      inArray(schema.issues.repositoryId, favoriteRepoIds),
      sql`(${schema.issues.reactionCount} + ${schema.issues.commentCount}) > 5`
    ))
    .orderBy(desc(sql`${schema.issues.reactionCount} + ${schema.issues.commentCount}`))
    .limit(10)

  // 5. Priority bugs (issues with bug + priority labels)
  // First get label IDs for bug and priority labels
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

  let priorityBugs: typeof hotIssues = []
  if (bugLabelIds.length > 0) {
    const issuesWithBugLabels = await db
      .selectDistinct({ issueId: schema.issueLabels.issueId })
      .from(schema.issueLabels)
      .where(inArray(schema.issueLabels.labelId, bugLabelIds))

    const bugIssueIds = issuesWithBugLabels.map(i => i.issueId)

    if (bugIssueIds.length > 0) {
      priorityBugs = await db
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
    }
  }

  // 6. Assigned to me
  const assignedToMe = await db
    .select({
      id: schema.issues.id,
      type: schema.issues.type,
      number: schema.issues.number,
      title: schema.issues.title,
      state: schema.issues.state,
      draft: schema.issues.draft,
      merged: schema.issues.merged,
      htmlUrl: schema.issues.htmlUrl,
      createdAt: schema.issues.createdAt,
      updatedAt: schema.issues.updatedAt,
      repository: {
        id: schema.repositories.id,
        name: schema.repositories.name,
        fullName: schema.repositories.fullName
      }
    })
    .from(schema.issueAssignees)
    .innerJoin(schema.issues, eq(schema.issueAssignees.issueId, schema.issues.id))
    .innerJoin(schema.repositories, eq(schema.issues.repositoryId, schema.repositories.id))
    .where(and(
      eq(schema.issueAssignees.userId, userId),
      eq(schema.issues.state, 'open'),
      inArray(schema.issues.repositoryId, favoriteRepoIds)
    ))
    .orderBy(desc(schema.issues.updatedAt))
    .limit(10)

  // 7. Recommended issues for today
  // Mix of: recent issues with good first issue label, issues with help wanted,
  // and older issues that need attention
  const helpLabels = await db
    .select({ id: schema.labels.id })
    .from(schema.labels)
    .where(and(
      inArray(schema.labels.repositoryId, favoriteRepoIds),
      or(
        ilike(schema.labels.name, '%good first issue%'),
        ilike(schema.labels.name, '%help wanted%'),
        ilike(schema.labels.name, '%contributions welcome%')
      )
    ))

  const helpLabelIds = helpLabels.map(l => l.id)

  let recommendedToday: typeof hotIssues = []
  if (helpLabelIds.length > 0) {
    const issuesWithHelpLabels = await db
      .selectDistinct({ issueId: schema.issueLabels.issueId })
      .from(schema.issueLabels)
      .where(inArray(schema.issueLabels.labelId, helpLabelIds))

    const helpIssueIds = issuesWithHelpLabels.map(i => i.issueId)

    if (helpIssueIds.length > 0) {
      recommendedToday = await db
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
          inArray(schema.issues.id, helpIssueIds),
          inArray(schema.issues.repositoryId, favoriteRepoIds)
        ))
        .orderBy(desc(schema.issues.reactionCount))
        .limit(5)
    }
  }

  // If not enough recommended issues, add some recent open issues
  if (recommendedToday.length < 5) {
    const existingIds = recommendedToday.map(i => i.id)
    const additionalIssues = await db
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
        inArray(schema.issues.repositoryId, favoriteRepoIds),
        existingIds.length > 0 ? sql`${schema.issues.id} NOT IN (${sql.join(existingIds.map(id => sql`${id}`), sql`, `)})` : sql`1=1`
      ))
      .orderBy(desc(schema.issues.createdAt))
      .limit(5 - recommendedToday.length)

    recommendedToday = [...recommendedToday, ...additionalIssues]
  }

  return {
    hasFavorites: true,
    myPullRequests,
    reviewRequested: reviewRequestedPRs,
    renovatePRs: renovatePRsWithCI,
    hotIssues,
    priorityBugs,
    assignedToMe,
    recommendedToday
  }
})
