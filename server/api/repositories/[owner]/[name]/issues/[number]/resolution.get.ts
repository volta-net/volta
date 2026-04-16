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

  const fullName = `${owner}/${name}`
  const repository = await db.query.repositories.findFirst({
    where: eq(schema.repositories.fullName, fullName)
  })

  if (!repository) {
    throw createError({ statusCode: 404, message: 'Repository not found' })
  }

  if (repository.private) {
    await requireRepositoryAccess(user.id, repository.id)
  }

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

  const skippedResponse = {
    status: null,
    answeredBy: null,
    answerCommentId: null,
    confidence: null,
    analyzedAt: null,
    suggestedAction: null,
    draftReply: null,
    duplicateOfNumber: null,
    reasoning: null,
    skipped: true
  }

  if (issue.pullRequest) {
    return { ...skippedResponse, reason: 'Resolution analysis is only available for issues, not pull requests' }
  }

  if (issue.state === 'closed') {
    return { ...skippedResponse, reason: 'Resolution analysis is only available for open issues' }
  }

  if (forceReanalyze || isResolutionStale(issue.resolutionAnalyzedAt, issue.resolutionSuggestedAction)) {
    const { token: userToken, model: userModel } = await getUserAiSettings(user.id)
    const userGateway = createUserGateway(userToken)

    if (!userGateway) {
      throw createError({
        statusCode: 403,
        message: 'Vercel AI Gateway token not configured. Add your token in Settings to enable AI features.'
      })
    }

    try {
      const result = await analyzeAndStoreResolution(issue.id, user.id, userGateway, userModel)
      if (result) {
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
          suggestedAction: freshIssue?.resolutionSuggestedAction ?? null,
          draftReply: freshIssue?.resolutionDraftReply ?? null,
          duplicateOfNumber: freshIssue?.resolutionDuplicateOf ?? null,
          reasoning: freshIssue?.resolutionReasoning ?? null,
          skipped: false
        }
      }
    } catch (err) {
      console.error('[resolution.get] Analysis failed:', err)
    }
  }

  return {
    status: issue.resolutionStatus,
    answeredBy: issue.resolutionAnsweredBy,
    answerCommentId: issue.resolutionAnswerCommentId,
    confidence: issue.resolutionConfidence,
    analyzedAt: issue.resolutionAnalyzedAt,
    suggestedAction: issue.resolutionSuggestedAction,
    draftReply: issue.resolutionDraftReply,
    duplicateOfNumber: issue.resolutionDuplicateOf,
    reasoning: issue.resolutionReasoning,
    skipped: false
  }
})
