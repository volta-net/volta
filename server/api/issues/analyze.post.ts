import { and, eq, inArray, isNull } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import type { ResolutionStatus } from '@nuxthub/db/schema'

interface AnalysisProgress {
  type: 'progress'
  current: number
  total: number
  issue: {
    id: number
    number: number
    title: string
    repository: string
  }
  result: ResolutionStatus
}

interface AnalysisSummary {
  type: 'summary'
  total: number
  results: {
    answered: number
    likely_resolved: number
    waiting_on_author: number
    needs_attention: number
  }
}

/**
 * Trigger AI resolution analysis on all open issues from favorite repositories
 * that have never been analyzed (resolutionAnalyzedAt IS NULL).
 *
 * Uses Server-Sent Events (SSE) to stream progress in real-time.
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  const favoriteRepoIdsSubquery = getUserFavoriteRepoIdsSubquery(user.id)

  // Get all open issues that have never been analyzed
  const issuesToAnalyze = await db.query.issues.findMany({
    where: and(
      inArray(schema.issues.repositoryId, favoriteRepoIdsSubquery),
      eq(schema.issues.pullRequest, false),
      eq(schema.issues.state, 'open'),
      isNull(schema.issues.resolutionAnalyzedAt)
    ),
    with: {
      repository: true
    },
    orderBy: (issues, { desc }) => [desc(issues.updatedAt)]
  })

  if (issuesToAnalyze.length === 0) {
    return {
      type: 'summary',
      total: 0,
      results: {
        answered: 0,
        likely_resolved: 0,
        waiting_on_author: 0,
        needs_attention: 0
      },
      message: 'No unanalyzed issues found'
    }
  }

  // Set up SSE response
  setResponseHeaders(event, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  })

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      const results = {
        answered: 0,
        likely_resolved: 0,
        waiting_on_author: 0,
        needs_attention: 0
      }

      // Process issues sequentially
      for (let i = 0; i < issuesToAnalyze.length; i++) {
        const issue = issuesToAnalyze[i]!

        try {
          // Run AI analysis
          const result = await analyzeAndStoreResolution(issue.id)

          if (result) {
            results[result.status]++

            // Send progress event
            const progress: AnalysisProgress = {
              type: 'progress',
              current: i + 1,
              total: issuesToAnalyze.length,
              issue: {
                id: issue.id,
                number: issue.number,
                title: issue.title,
                repository: issue.repository.fullName
              },
              result: result.status
            }

            controller.enqueue(encoder.encode(`data: ${JSON.stringify(progress)}\n\n`))
          }
        } catch (error) {
          console.error(`[analyze] Failed to analyze issue ${issue.id}:`, error)
          // Continue with next issue even if one fails
          results.needs_attention++

          const progress: AnalysisProgress = {
            type: 'progress',
            current: i + 1,
            total: issuesToAnalyze.length,
            issue: {
              id: issue.id,
              number: issue.number,
              title: issue.title,
              repository: issue.repository.fullName
            },
            result: 'needs_attention'
          }

          controller.enqueue(encoder.encode(`data: ${JSON.stringify(progress)}\n\n`))
        }
      }

      // Send final summary
      const summary: AnalysisSummary = {
        type: 'summary',
        total: issuesToAnalyze.length,
        results
      }

      controller.enqueue(encoder.encode(`data: ${JSON.stringify(summary)}\n\n`))
      controller.close()
    }
  })

  return stream
})
