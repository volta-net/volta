import { generateText, Output } from 'ai'
import { gateway } from '@ai-sdk/gateway'
import { z } from 'zod'
import { eq, and, inArray } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import type { ResolutionStatus } from '@nuxthub/db/schema'
import type { GitHubIssue, GitHubRepository } from '../types/github'
import { getDbRepositoryId } from './users'
import { getDbIssueId } from './sync'

// Schema for AI response
const resolutionAnalysisSchema = z.object({
  status: z.enum(['answered', 'likely_resolved', 'waiting_on_author', 'needs_attention']),
  answeredByCommentIndex: z.number().nullable().describe('Index of the comment that answered the question (0-based), or null if no answer'),
  confidence: z.number().min(0).max(100).describe('Confidence level 0-100'),
  reasoning: z.string().describe('Brief explanation for the decision')
})

interface IssueForAnalysis {
  id: number
  number: number
  title: string
  body: string | null
  userId: number | null
  repositoryId: number
  pullRequest: boolean
}

interface CommentForAnalysis {
  id: number
  body: string
  userId: number | null
  createdAt: Date | string
  user?: {
    id: number
    login: string
  } | null
}

interface AnalysisResult {
  status: ResolutionStatus
  answeredByUserId: number | null
  answerCommentId: number | null
  confidence: number
}

/**
 * Build the prompt for AI analysis
 */
function buildAnalysisPrompt(
  issue: IssueForAnalysis,
  comments: CommentForAnalysis[],
  maintainerIds: Set<number>
): string {
  const parts: string[] = []

  parts.push(`Issue #${issue.number}: ${issue.title}`)
  if (issue.body) {
    parts.push(`\nOriginal question/problem:\n${issue.body}`)
  }

  if (comments.length > 0) {
    parts.push(`\n\nConversation (${comments.length} comments):`)
    comments.forEach((comment, index) => {
      const isAuthor = comment.userId === issue.userId
      const isMaintainer = comment.userId ? maintainerIds.has(comment.userId) : false
      const role = isAuthor ? ' [author]' : isMaintainer ? ' [maintainer]' : ''
      const login = comment.user?.login ?? 'unknown'
      parts.push(`\n[${index}] @${login}${role}:\n${comment.body}`)
    })
  } else {
    parts.push('\n\nNo comments yet.')
  }

  return parts.join('\n')
}

/**
 * Calculate days since a date
 */
function daysSince(date: Date | string): number {
  const d = typeof date === 'string' ? new Date(date) : date
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24))
}

/**
 * Analyze if an issue has been answered using AI
 */
export async function analyzeIssueResolution(
  issue: IssueForAnalysis,
  comments: CommentForAnalysis[],
  maintainerIds: Set<number>
): Promise<AnalysisResult> {
  // No comments = needs attention
  if (comments.length === 0) {
    return {
      status: 'needs_attention',
      answeredByUserId: null,
      answerCommentId: null,
      confidence: 100
    }
  }

  // Find the last comment
  const lastComment = comments[comments.length - 1]
  const daysSinceLastComment = lastComment ? daysSince(lastComment.createdAt) : 0

  const systemPrompt = `You are an AI that analyzes GitHub issue conversations to determine if the issue has been answered.

Your task is to determine:
1. Has someone PROVIDED a quality answer to the original question/problem?
2. Is someone waiting for the author to respond (asked for more info)?

IMPORTANT RULES:
- An answer does NOT require author confirmation. Many users never respond after getting help.
- Look for: code snippets, configuration examples, step-by-step instructions, links to docs, explanations
- "answered" = A clear, actionable solution was provided
- "likely_resolved" = An answer was provided and author hasn't responded for 7+ days
- "waiting_on_author" = Someone asked the author for more information/clarification
- "needs_attention" = No quality answer provided yet

Consider the time factor: ${daysSinceLastComment} days since last comment.
If a good answer was provided and no follow-up for 7+ days, use "likely_resolved".`

  const prompt = buildAnalysisPrompt(issue, comments, maintainerIds)

  try {
    const { output } = await generateText({
      model: gateway('anthropic/claude-sonnet-4.5'),
      output: Output.object({ schema: resolutionAnalysisSchema }),
      system: systemPrompt,
      prompt
    })

    // Map the comment index to actual IDs
    let answeredByUserId: number | null = null
    let answerCommentId: number | null = null

    if (output.answeredByCommentIndex !== null && output.answeredByCommentIndex >= 0 && output.answeredByCommentIndex < comments.length) {
      const answerComment = comments[output.answeredByCommentIndex]
      answeredByUserId = answerComment?.userId ?? null
      answerCommentId = answerComment?.id ?? null
    }

    // Adjust status based on time if answer was provided
    let status = output.status as ResolutionStatus
    if (status === 'answered' && daysSinceLastComment >= 7 && answerCommentId) {
      // If answered but no activity for 7+ days, mark as likely_resolved
      status = 'likely_resolved'
    }

    return {
      status,
      answeredByUserId,
      answerCommentId,
      confidence: output.confidence
    }
  } catch (error) {
    console.error('[resolution] AI analysis failed:', error)
    // Fallback: mark as needs_attention if AI fails
    return {
      status: 'needs_attention',
      answeredByUserId: null,
      answerCommentId: null,
      confidence: 0
    }
  }
}

/**
 * Fetch and analyze resolution for an issue, then store the result
 */
export async function analyzeAndStoreResolution(issueId: number): Promise<AnalysisResult | null> {
  // Fetch issue with comments
  const issue = await db.query.issues.findFirst({
    where: eq(schema.issues.id, issueId),
    with: {
      comments: {
        with: {
          user: true
        },
        orderBy: (comments, { asc }) => [asc(comments.createdAt)]
      }
    }
  })

  if (!issue) {
    console.warn(`[resolution] Issue ${issueId} not found`)
    return null
  }

  // Skip PRs
  if (issue.pullRequest) {
    return null
  }

  // Skip closed issues
  if (issue.state === 'closed') {
    return null
  }

  // Get maintainer IDs for this repository
  const maintainerPermissions = ['admin', 'maintain', 'write'] as const
  const collaborators = await db.query.repositoryCollaborators.findMany({
    where: and(
      eq(schema.repositoryCollaborators.repositoryId, issue.repositoryId),
      inArray(schema.repositoryCollaborators.permission, [...maintainerPermissions])
    )
  })
  const maintainerIds = new Set(collaborators.map(c => c.userId))

  // Run AI analysis
  const result = await analyzeIssueResolution(
    {
      id: issue.id,
      number: issue.number,
      title: issue.title,
      body: issue.body,
      userId: issue.userId,
      repositoryId: issue.repositoryId,
      pullRequest: issue.pullRequest
    },
    issue.comments.map(c => ({
      id: c.id,
      body: c.body,
      userId: c.userId,
      createdAt: c.createdAt,
      user: c.user ? { id: c.user.id, login: c.user.login } : null
    })),
    maintainerIds
  )

  // Store result in database
  await db.update(schema.issues).set({
    resolutionStatus: result.status,
    resolutionAnsweredById: result.answeredByUserId,
    resolutionAnswerCommentId: result.answerCommentId,
    resolutionConfidence: result.confidence,
    resolutionAnalyzedAt: new Date()
  }).where(eq(schema.issues.id, issueId))

  return result
}

/**
 * Check if resolution analysis is stale (older than 1 hour) or never done
 */
export function isResolutionStale(analyzedAt: Date | string | null): boolean {
  if (!analyzedAt) {
    return true
  }
  const d = typeof analyzedAt === 'string' ? new Date(analyzedAt) : analyzedAt
  const oneHourAgo = Date.now() - (60 * 60 * 1000)
  return d.getTime() < oneHourAgo
}

/**
 * Invalidate resolution cache when a new comment arrives
 * This sets resolutionAnalyzedAt to null so the next view triggers fresh analysis
 */
export function invalidateResolutionCache(
  issue: GitHubIssue,
  repository: GitHubRepository
): void {
  // Skip PRs
  if (issue.pull_request) return

  // Skip closed issues
  if (issue.state === 'closed') return

  // Run async without waiting
  (async () => {
    const dbRepoId = await getDbRepositoryId(repository.id)
    if (!dbRepoId) return

    const dbIssueId = await getDbIssueId(dbRepoId, issue.number)
    if (!dbIssueId) return

    await db.update(schema.issues).set({
      resolutionAnalyzedAt: null
    }).where(eq(schema.issues.id, dbIssueId))
  })().catch((err) => {
    console.error('[resolution] Cache invalidation failed:', err)
  })
}
