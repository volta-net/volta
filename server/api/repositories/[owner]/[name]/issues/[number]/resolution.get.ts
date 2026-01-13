import { eq, and } from 'drizzle-orm'
import { db, schema } from 'hub:db'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const owner = getRouterParam(event, 'owner')
  const name = getRouterParam(event, 'name')
  const numberParam = getRouterParam(event, 'number')

  if (!owner || !name || !numberParam) {
    throw createError({ statusCode: 400, message: 'Owner, name, and issue number are required' })
  }

  const issueNumber = parseInt(numberParam)
  if (isNaN(issueNumber)) {
    throw createError({ statusCode: 400, message: 'Invalid issue number' })
  }

  // Find repository by owner/name
  const fullName = `${owner}/${name}`
  const repository = await db.query.repositories.findFirst({
    where: eq(schema.repositories.fullName, fullName)
  })

  if (!repository) {
    throw createError({ statusCode: 404, message: 'Repository not found' })
  }

  // Check user has access to this repository
  await requireRepositoryAccess(user.id, repository.id)

  // Find issue by repository + number
  const issue = await db.query.issues.findFirst({
    where: and(
      eq(schema.issues.repositoryId, repository.id),
      eq(schema.issues.number, issueNumber)
    ),
    with: {
      resolutionAnsweredBy: true
    }
  })

  if (!issue) {
    throw createError({ statusCode: 404, message: 'Issue not found' })
  }

  // Skip PRs - resolution analysis is only for issues
  if (issue.pullRequest) {
    return {
      status: null,
      answeredBy: null,
      answerCommentId: null,
      confidence: null,
      analyzedAt: null,
      skipped: true,
      reason: 'Resolution analysis is only available for issues, not pull requests'
    }
  }

  // Skip closed issues - no need to analyze
  if (issue.state === 'closed') {
    return {
      status: null,
      answeredBy: null,
      answerCommentId: null,
      confidence: null,
      analyzedAt: null,
      skipped: true,
      reason: 'Resolution analysis is only available for open issues'
    }
  }

  // Helper to get or generate suggested answer if issue needs attention
  async function getSuggestedAnswerIfNeeded(
    status: string | null,
    issueId: number,
    repositoryId: number,
    currentUserId: number,
    cachedSuggestedAnswer: string | null
  ): Promise<string | null> {
    if (status !== 'needs_attention') {
      return null
    }

    // Return cached answer if available
    if (cachedSuggestedAnswer) {
      return cachedSuggestedAnswer
    }

    // Fetch issue with comments for suggestion generation
    const issueWithComments = await db.query.issues.findFirst({
      where: eq(schema.issues.id, issueId),
      with: {
        comments: {
          with: { user: true },
          orderBy: (comments, { asc }) => [asc(comments.createdAt)]
        }
      }
    })

    if (!issueWithComments) {
      return null
    }

    // Fetch user's recent comments in this repository for style matching
    const userRecentComments = await db.query.issueComments.findMany({
      where: eq(schema.issueComments.userId, currentUserId),
      with: {
        issue: true
      },
      orderBy: (comments, { desc }) => [desc(comments.createdAt)],
      limit: 10
    })

    // Filter to comments from issues in the same repository
    const userStyleComments = userRecentComments
      .filter(c => c.issue?.repositoryId === repositoryId)
      .slice(0, 5)
      .map(c => ({ body: c.body }))

    const suggestedAnswer = await generateSuggestedAnswer(
      {
        id: issueWithComments.id,
        number: issueWithComments.number,
        title: issueWithComments.title,
        body: issueWithComments.body,
        userId: issueWithComments.userId,
        repositoryId: issueWithComments.repositoryId,
        pullRequest: issueWithComments.pullRequest
      },
      issueWithComments.comments.map(c => ({
        id: c.id,
        body: c.body,
        userId: c.userId,
        createdAt: c.createdAt,
        user: c.user ? { id: c.user.id, login: c.user.login } : null
      })),
      userStyleComments.length > 0 ? userStyleComments : undefined
    )

    // Cache the generated answer in the database
    if (suggestedAnswer) {
      await db.update(schema.issues)
        .set({ resolutionSuggestedAnswer: suggestedAnswer })
        .where(eq(schema.issues.id, issueId))
    }

    return suggestedAnswer
  }

  // If never analyzed or stale, await fresh analysis
  if (isResolutionStale(issue.resolutionAnalyzedAt)) {
    try {
      const result = await analyzeAndStoreResolution(issue.id)
      if (result) {
        // Re-fetch to get the answeredBy user relation
        const freshIssue = await db.query.issues.findFirst({
          where: eq(schema.issues.id, issue.id),
          with: {
            resolutionAnsweredBy: true
          }
        })

        const status = freshIssue?.resolutionStatus ?? null
        const suggestedAnswer = await getSuggestedAnswerIfNeeded(status, issue.id, repository.id, user.id, freshIssue?.resolutionSuggestedAnswer ?? null)

        return {
          status,
          answeredBy: freshIssue?.resolutionAnsweredBy ?? null,
          answerCommentId: freshIssue?.resolutionAnswerCommentId ?? null,
          confidence: freshIssue?.resolutionConfidence ?? null,
          analyzedAt: freshIssue?.resolutionAnalyzedAt ?? null,
          skipped: false,
          suggestedAnswer
        }
      }
    } catch (err) {
      console.error('[resolution.get] Analysis failed:', err)
    }
  }

  // Get or generate suggested answer if current status is needs_attention
  const suggestedAnswer = await getSuggestedAnswerIfNeeded(issue.resolutionStatus, issue.id, repository.id, user.id, issue.resolutionSuggestedAnswer)

  // Return current resolution status (fresh or fallback to cached)
  return {
    status: issue.resolutionStatus,
    answeredBy: issue.resolutionAnsweredBy,
    answerCommentId: issue.resolutionAnswerCommentId,
    confidence: issue.resolutionConfidence,
    analyzedAt: issue.resolutionAnalyzedAt,
    skipped: false,
    suggestedAnswer
  }
})
