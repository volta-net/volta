import { eq, and } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const owner = getRouterParam(event, 'owner')
  const name = getRouterParam(event, 'name')
  const numberParam = getRouterParam(event, 'number')
  const query = getQuery(event)
  const forceReanalyze = query.force === 'true'

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

  // If never analyzed, stale, or force re-analyze requested, await fresh analysis
  if (forceReanalyze || isResolutionStale(issue.resolutionAnalyzedAt)) {
    // Get user's AI token
    const userToken = await getUserAiToken(user.id)
    const userGateway = createUserGateway(userToken)

    // Throw 403 if user has no AI token configured
    if (!userGateway) {
      throw createError({
        statusCode: 403,
        message: 'Vercel AI Gateway token not configured. Add your token in Settings to enable AI features.'
      })
    }

    try {
      const result = await analyzeAndStoreResolution(issue.id, userGateway)
      if (result) {
        // Re-fetch to get the answeredBy user relation
        const freshIssue = await db.query.issues.findFirst({
          where: eq(schema.issues.id, issue.id),
          with: {
            resolutionAnsweredBy: true
          }
        })

        return {
          status: freshIssue?.resolutionStatus ?? null,
          answeredBy: freshIssue?.resolutionAnsweredBy ?? null,
          answerCommentId: freshIssue?.resolutionAnswerCommentId ?? null,
          confidence: freshIssue?.resolutionConfidence ?? null,
          analyzedAt: freshIssue?.resolutionAnalyzedAt ?? null,
          skipped: false
        }
      }
    } catch (err) {
      console.error('[resolution.get] Analysis failed:', err)
    }
  }

  // Return current resolution status (fresh or fallback to cached)
  return {
    status: issue.resolutionStatus,
    answeredBy: issue.resolutionAnsweredBy,
    answerCommentId: issue.resolutionAnswerCommentId,
    confidence: issue.resolutionConfidence,
    analyzedAt: issue.resolutionAnalyzedAt,
    skipped: false
  }
})
