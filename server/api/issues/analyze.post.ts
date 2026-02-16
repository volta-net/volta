import { eq, and, inArray } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const body = await readBody<{ issueIds: number[] }>(event)

  if (!body?.issueIds?.length) {
    throw createError({ statusCode: 400, message: 'issueIds array is required' })
  }

  // Cap to 50 issues per request
  const issueIds = body.issueIds.slice(0, 50)

  // Get user's AI settings
  const { token: userToken, model: userModel } = await getUserAiSettings(user.id)
  const userGateway = createUserGateway(userToken)

  if (!userGateway) {
    throw createError({
      statusCode: 403,
      message: 'Vercel AI Gateway token not configured. Add your token in Settings to enable AI features.'
    })
  }

  // Verify that all requested issues belong to repositories the user has access to
  const accessibleRepoIds = db
    .select({ repositoryId: schema.repositoryCollaborators.repositoryId })
    .from(schema.repositoryCollaborators)
    .where(eq(schema.repositoryCollaborators.userId, user.id))

  const issues = await db.query.issues.findMany({
    where: and(
      inArray(schema.issues.id, issueIds),
      inArray(schema.issues.repositoryId, accessibleRepoIds),
      eq(schema.issues.pullRequest, false),
      eq(schema.issues.state, 'open')
    ),
    columns: {
      id: true,
      number: true,
      resolutionStatus: true,
      resolutionAnalyzedAt: true
    }
  })

  // Filter to only unanalyzed or stale issues
  const toAnalyze = issues.filter(issue => isResolutionStale(issue.resolutionAnalyzedAt))

  if (!toAnalyze.length) {
    return { total: 0, analyzed: 0, results: [] }
  }

  // Set up SSE streaming
  setResponseHeader(event, 'Content-Type', 'text/event-stream')
  setResponseHeader(event, 'Cache-Control', 'no-cache')
  setResponseHeader(event, 'Connection', 'keep-alive')

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      // Send initial count
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'start', total: toAnalyze.length })}\n\n`))

      let analyzed = 0

      for (const issue of toAnalyze) {
        try {
          const result = await analyzeAndStoreResolution(issue.id, userGateway, userModel)
          analyzed++

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'progress',
            issueId: issue.id,
            issueNumber: issue.number,
            analyzed,
            total: toAnalyze.length,
            result: result ? {
              status: result.status,
              confidence: result.confidence
            } : null
          })}\n\n`))
        }
        catch (err) {
          analyzed++
          console.error(`[bulk-analyze] Failed to analyze issue ${issue.id}:`, err)

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'progress',
            issueId: issue.id,
            issueNumber: issue.number,
            analyzed,
            total: toAnalyze.length,
            error: true
          })}\n\n`))
        }
      }

      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done', analyzed, total: toAnalyze.length })}\n\n`))
      controller.close()
    }
  })

  return sendStream(event, stream)
})
