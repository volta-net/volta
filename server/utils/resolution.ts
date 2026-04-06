import { generateText, Output, type LanguageModel } from 'ai'
import type { GatewayModelId } from '@ai-sdk/gateway'
import { z } from 'zod'
import { eq, and, inArray, ne, desc, isNotNull } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import type { ResolutionStatus, SuggestedAction } from '@nuxthub/db/schema'
import type { GitHubRepository } from '../types/github'
import { getDbRepositoryId } from './users'
import { getDbIssueId } from './sync'
import { DEFAULT_AI_MODEL } from './ai'

type GatewayFn = (modelId: GatewayModelId) => LanguageModel

const resolutionAnalysisSchema = z.object({
  status: z.enum(['answered', 'likely_resolved', 'waiting_on_author', 'needs_attention']),
  answeredByCommentIndex: z.number().nullable().describe('Index of the comment that answered the question (0-based), or null if no answer'),
  confidence: z.number().min(0).max(100).describe('Confidence level 0-100'),
  reasoning: z.string().describe('Brief explanation for the decision (1-2 sentences)'),
  suggestedAction: z.enum(['close_resolved', 'close_not_planned', 'close_duplicate', 'ask_reproduction', 'respond', 'none']).describe(
    'What the maintainer should do next. close_resolved = issue is answered and can be closed. close_not_planned = not a valid issue or won\'t be fixed. close_duplicate = duplicate of another issue. ask_reproduction = ask author for a minimal reproduction. respond = maintainer should reply with information. none = no clear action needed.'
  ),
  draftReply: z.string().nullable().describe('A short, casual draft reply the maintainer can post as-is. Write as the maintainer, not as an AI. null if no reply is needed (e.g. action is "none").'),
  duplicateOfNumber: z.number().nullable().describe('If suggestedAction is close_duplicate, the issue number it duplicates. null otherwise.')
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

export interface AnalysisResult {
  status: ResolutionStatus
  answeredByUserId: number | null
  answerCommentId: number | null
  confidence: number
  suggestedAction: SuggestedAction
  draftReply: string | null
  duplicateOfNumber: number | null
  reasoning: string
}

interface LinkedPRForAnalysis {
  number: number
  title: string
  body: string | null
  state: string
  mergedAt: Date | string | null
}

interface ProjectContext {
  repoDescription: string | null
  labels: { name: string, description: string | null }[]
  recentReleases: { tagName: string, body: string | null, publishedAt: Date | string | null }[]
  recentClosedIssues: { number: number, title: string, body: string | null, stateReason: string | null }[]
  linkedPRs: LinkedPRForAnalysis[]
  maintainerStyleExamples: string[]
}

async function fetchProjectContext(repositoryId: number, issueId: number, maintainerUserIds: number[]): Promise<ProjectContext> {
  const [repo, labels, releases, closedIssues, linkedPRRows, styleExamples] = await Promise.all([
    db.query.repositories.findFirst({
      where: eq(schema.repositories.id, repositoryId),
      columns: { description: true }
    }),

    db.query.labels.findMany({
      where: eq(schema.labels.repositoryId, repositoryId),
      columns: { name: true, description: true },
      orderBy: (labels, { asc }) => [asc(labels.name)]
    }),

    db.query.releases.findMany({
      where: eq(schema.releases.repositoryId, repositoryId),
      columns: { tagName: true, body: true, publishedAt: true },
      orderBy: (releases, { desc }) => [desc(releases.publishedAt)],
      limit: 5
    }),

    db.query.issues.findMany({
      where: and(
        eq(schema.issues.repositoryId, repositoryId),
        eq(schema.issues.pullRequest, false),
        eq(schema.issues.state, 'closed'),
        ne(schema.issues.id, issueId)
      ),
      columns: { number: true, title: true, body: true, stateReason: true },
      orderBy: (issues, { desc }) => [desc(issues.closedAt)],
      limit: 30
    }),

    db.select({
      number: schema.issues.number,
      title: schema.issues.title,
      body: schema.issues.body,
      state: schema.issues.state,
      mergedAt: schema.issues.mergedAt
    })
      .from(schema.issueLinkedPrs)
      .innerJoin(schema.issues, eq(schema.issueLinkedPrs.prId, schema.issues.id))
      .where(eq(schema.issueLinkedPrs.issueId, issueId)),

    fetchMaintainerStyleExamples(maintainerUserIds, issueId)
  ])

  return {
    repoDescription: repo?.description ?? null,
    labels,
    recentReleases: releases,
    recentClosedIssues: closedIssues,
    linkedPRs: linkedPRRows,
    maintainerStyleExamples: styleExamples
  }
}

async function fetchMaintainerStyleExamples(maintainerUserIds: number[], excludeIssueId: number): Promise<string[]> {
  if (!maintainerUserIds.length) return []

  const primaryMaintainerId = maintainerUserIds[0]!
  const recentComments = await db.query.issueComments.findMany({
    where: and(
      eq(schema.issueComments.userId, primaryMaintainerId),
      ne(schema.issueComments.issueId, excludeIssueId),
      isNotNull(schema.issueComments.body)
    ),
    orderBy: [desc(schema.issueComments.createdAt)],
    limit: 10
  })

  return recentComments
    .map(c => c.body)
    .filter((body): body is string => !!body && body.length > 0 && body.length < 1000)
}

function buildEnrichedPrompt(
  issue: IssueForAnalysis,
  comments: CommentForAnalysis[],
  maintainerIds: Set<number>,
  context: ProjectContext
): string {
  const parts: string[] = []

  // Issue details
  parts.push(`Issue #${issue.number}: ${issue.title}`)
  if (issue.body) {
    parts.push(`\nOriginal question/problem:\n${issue.body}`)
  }

  // Conversation
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

  // Project context
  if (context.repoDescription) {
    parts.push(`\n\nREPOSITORY DESCRIPTION: ${context.repoDescription}`)
  }

  if (context.labels.length > 0) {
    const labelList = context.labels
      .filter(l => l.description)
      .map(l => `- ${l.name}: ${l.description}`)
      .join('\n')
    if (labelList) {
      parts.push(`\n\nREPOSITORY LABELS:\n${labelList}`)
    }
  }

  if (context.recentReleases.length > 0) {
    const releaseList = context.recentReleases.map((r) => {
      const body = r.body ? `\n${r.body.slice(0, 1500)}${r.body.length > 1500 ? '...' : ''}` : ''
      return `- ${r.tagName}${body}`
    }).join('\n\n')
    parts.push(`\n\nRECENT RELEASES (check if the issue was fixed in a release):\n${releaseList}`)
  }

  if (context.linkedPRs.length > 0) {
    const prList = context.linkedPRs.map((pr) => {
      const status = pr.mergedAt ? 'merged' : pr.state
      const body = pr.body ? `\n${pr.body.slice(0, 2000)}${pr.body.length > 2000 ? '...' : ''}` : ''
      return `- PR #${pr.number} [${status}]: ${pr.title}${body}`
    }).join('\n\n')
    parts.push(`\n\nLINKED PULL REQUESTS (PRs that reference this issue — read the description to understand what was changed/fixed):\n${prList}`)
  }

  if (context.recentClosedIssues.length > 0) {
    const issueList = context.recentClosedIssues.map((i) => {
      const reason = i.stateReason ? ` [${i.stateReason}]` : ''
      const body = i.body ? ` — ${i.body.slice(0, 150)}${i.body.length > 150 ? '...' : ''}` : ''
      return `#${i.number}${reason}: ${i.title}${body}`
    }).join('\n')
    parts.push(`\n\nRECENTLY CLOSED ISSUES (check for duplicates or already-fixed problems):\n${issueList}`)
  }

  return parts.join('\n')
}

function daysSince(date: Date | string): number {
  const d = typeof date === 'string' ? new Date(date) : date
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24))
}

export async function analyzeIssueResolution(
  issue: IssueForAnalysis,
  comments: CommentForAnalysis[],
  maintainerIds: Set<number>,
  context: ProjectContext,
  userGateway: GatewayFn,
  modelId: GatewayModelId = DEFAULT_AI_MODEL
): Promise<AnalysisResult> {
  const lastComment = comments[comments.length - 1]
  const daysSinceLastComment = lastComment ? daysSince(lastComment.createdAt) : 0

  const styleGuidance = context.maintainerStyleExamples.length > 0
    ? `\n\nMAINTAINER WRITING STYLE (match this tone and style for draftReply):
${context.maintainerStyleExamples.slice(0, 5).map((ex, i) => `Example ${i + 1}: "${ex.slice(0, 300)}${ex.length > 300 ? '...' : ''}"`).join('\n')}`
    : ''

  const systemPrompt = `You are an AI that analyzes GitHub issue conversations for an open-source maintainer.

Your job is to:
1. CLASSIFY the issue's current status
2. RECOMMEND a specific action for the maintainer
3. DRAFT a reply the maintainer can post as-is (if applicable)

STATUS DEFINITIONS:
- "answered" = A clear, actionable solution was provided by someone
- "likely_resolved" = An answer was provided and author hasn't responded for 7+ days
- "waiting_on_author" = Someone asked the author for more info and is waiting
- "needs_attention" = No quality answer has been provided yet

ACTION DEFINITIONS:
- "close_resolved" = The issue has been clearly answered or fixed (in a comment, linked PR, or recent release). Safe to close with a thank-you or summary.
- "close_not_planned" = Not a real bug, out of scope, or won't be fixed. Close with brief explanation.
- "close_duplicate" = This is a duplicate of another issue. Set duplicateOfNumber to that issue's number.
- "ask_reproduction" = The author didn't provide enough information or a minimal reproduction to debug. Ask for one.
- "respond" = The maintainer needs to reply with technical guidance, workaround, or acknowledgment.
- "none" = No clear action needed right now (e.g., discussion is ongoing, or it's already being handled).

IMPORTANT RULES:
- An answer does NOT require author confirmation. Many users never respond after getting help.
- Cross-reference LINKED PULL REQUESTS — if a merged PR fixes this issue, suggest closing as resolved and reference the PR number.
- Cross-reference RECENT RELEASES — if a fix was shipped in a release, suggest closing as resolved and mention the version.
- Cross-reference RECENTLY CLOSED ISSUES — if this is a duplicate, suggest closing as duplicate with the issue number.
- When drafting a reply, write as the maintainer (casual, direct, 1-3 sentences). NEVER say "I'm an AI" or sound robotic.
- For "ask_reproduction" replies, be friendly but specific about what you need (reproduction link, version, steps).
- For "close_resolved" replies, briefly summarize the solution or reference the release/comment/PR that fixed it.
- Set draftReply to null only when suggestedAction is "none".

Time context: ${daysSinceLastComment} days since last comment. If a good answer exists and no follow-up for 7+ days, use "likely_resolved" with "close_resolved".${styleGuidance}`

  const prompt = buildEnrichedPrompt(issue, comments, maintainerIds, context)

  try {
    const { output } = await generateText({
      model: userGateway(modelId),
      output: Output.object({ schema: resolutionAnalysisSchema }),
      system: systemPrompt,
      prompt
    })

    let answeredByUserId: number | null = null
    let answerCommentId: number | null = null

    if (output.answeredByCommentIndex !== null && output.answeredByCommentIndex >= 0 && output.answeredByCommentIndex < comments.length) {
      const answerComment = comments[output.answeredByCommentIndex]
      answeredByUserId = answerComment?.userId ?? null
      answerCommentId = answerComment?.id ?? null
    }

    let status = output.status as ResolutionStatus
    if (status === 'answered' && daysSinceLastComment >= 7 && answerCommentId) {
      status = 'likely_resolved'
    }

    return {
      status,
      answeredByUserId,
      answerCommentId,
      confidence: output.confidence,
      suggestedAction: output.suggestedAction as SuggestedAction,
      draftReply: output.draftReply ?? null,
      duplicateOfNumber: output.duplicateOfNumber ?? null,
      reasoning: output.reasoning
    }
  } catch (error) {
    console.error('[resolution] AI analysis failed:', error)
    return {
      status: 'needs_attention',
      answeredByUserId: null,
      answerCommentId: null,
      confidence: 0,
      suggestedAction: 'none',
      draftReply: null,
      duplicateOfNumber: null,
      reasoning: 'AI analysis failed'
    }
  }
}

export async function analyzeAndStoreResolution(issueId: number, userGateway: GatewayFn, modelId: GatewayModelId = DEFAULT_AI_MODEL): Promise<AnalysisResult | null> {
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

  if (issue.pullRequest) return null
  if (issue.state === 'closed') return null

  // Get maintainer IDs for this repository
  const maintainerPermissions = ['admin', 'maintain', 'write'] as const
  const collaborators = await db.query.repositoryCollaborators.findMany({
    where: and(
      eq(schema.repositoryCollaborators.repositoryId, issue.repositoryId),
      inArray(schema.repositoryCollaborators.permission, [...maintainerPermissions])
    )
  })
  const maintainerIds = new Set(collaborators.map(c => c.userId))

  // Fetch project context for enriched analysis
  const context = await fetchProjectContext(
    issue.repositoryId,
    issue.id,
    collaborators.map(c => c.userId)
  )

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
    maintainerIds,
    context,
    userGateway,
    modelId
  )

  await db.update(schema.issues).set({
    resolutionStatus: result.status,
    resolutionAnsweredById: result.answeredByUserId,
    resolutionAnswerCommentId: result.answerCommentId,
    resolutionConfidence: result.confidence,
    resolutionAnalyzedAt: new Date(),
    resolutionSuggestedAction: result.suggestedAction,
    resolutionDraftReply: result.draftReply,
    resolutionDuplicateOf: result.duplicateOfNumber,
    resolutionReasoning: result.reasoning
  }).where(eq(schema.issues.id, issueId))

  return result
}

export function isResolutionStale(analyzedAt: Date | string | null, suggestedAction?: string | null): boolean {
  if (!analyzedAt) return true
  if (suggestedAction === undefined || suggestedAction === null) return true
  return false
}

interface WebhookIssue {
  number: number
  state: string
  pull_request?: unknown
}

export function invalidateResolutionCache(
  issue: WebhookIssue,
  repository: GitHubRepository
): void {
  if (issue.pull_request) return
  if (issue.state === 'closed') return

  ;(async () => {
    const dbRepoId = await getDbRepositoryId(repository.id)
    if (!dbRepoId) return

    const dbIssueId = await getDbIssueId(dbRepoId, issue.number)
    if (!dbIssueId) return

    await db.update(schema.issues).set({
      resolutionStatus: null,
      resolutionAnsweredById: null,
      resolutionAnswerCommentId: null,
      resolutionConfidence: null,
      resolutionAnalyzedAt: null,
      resolutionSuggestedAction: null,
      resolutionDraftReply: null,
      resolutionDuplicateOf: null,
      resolutionReasoning: null
    }).where(eq(schema.issues.id, dbIssueId))
  })().catch((err) => {
    console.error('[resolution] Cache invalidation failed:', err)
  })
}
