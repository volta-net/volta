import { generateObject } from 'ai'
import { z } from 'zod'
import { eq, inArray, and, gt, isNotNull } from 'drizzle-orm'
import { db, schema } from 'hub:db'

// Analysis timeout - if analyzingAt is older than this, consider it stale/failed
const ANALYSIS_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes

// Check if an issue is currently being analyzed (from DB)
export async function isAnalyzing(issueId: number): Promise<boolean> {
  const cutoff = new Date(Date.now() - ANALYSIS_TIMEOUT_MS)

  const [issue] = await db
    .select({ analyzingAt: schema.issues.analyzingAt })
    .from(schema.issues)
    .where(and(
      eq(schema.issues.id, issueId),
      isNotNull(schema.issues.analyzingAt),
      gt(schema.issues.analyzingAt, cutoff)
    ))
    .limit(1)

  return !!issue
}

// Get analyzing status for multiple issues (batch query)
export async function getAnalyzingStatus(issueIds: number[]): Promise<Set<number>> {
  if (issueIds.length === 0) return new Set()

  const cutoff = new Date(Date.now() - ANALYSIS_TIMEOUT_MS)

  const analyzing = await db
    .select({ id: schema.issues.id })
    .from(schema.issues)
    .where(and(
      inArray(schema.issues.id, issueIds),
      isNotNull(schema.issues.analyzingAt),
      gt(schema.issues.analyzingAt, cutoff)
    ))

  return new Set(analyzing.map(r => r.id))
}

// Mark issue as currently being analyzed
async function _markAnalyzing(issueId: number): Promise<void> {
  await db.update(schema.issues)
    .set({ analyzingAt: new Date() })
    .where(eq(schema.issues.id, issueId))
}

// Clear analyzing status
async function clearAnalyzing(issueId: number): Promise<void> {
  await db.update(schema.issues)
    .set({ analyzingAt: null })
    .where(eq(schema.issues.id, issueId))
}

interface IssueComment {
  id: number
  body: string | null
  authorLogin: string | null
}

interface IssueForAnalysis {
  id: number
  title: string
  body: string | null
  authorLogin: string | null
  maintainerLogins: string[]
  comments: IssueComment[]
  // Current state from DB
  updatedAt: Date | null
  answered: boolean | null
  analyzedAt: Date | null
  analyzingAt: Date | null
}

export interface AnalysisResult {
  answered: boolean
  answerCommentId: number | null
}

async function analyzeIssueWithAI(issue: IssueForAnalysis): Promise<AnalysisResult> {
  if (issue.comments.length === 0) {
    return { answered: false, answerCommentId: null }
  }

  const commentsText = issue.comments
    .map((c, i) => `[${i}] ${c.authorLogin || 'Unknown'}: ${c.body || '(empty)'}`)
    .join('\n\n')

  const maintainersInfo = issue.maintainerLogins.length > 0
    ? `Maintainers: ${issue.maintainerLogins.join(', ')}`
    : 'Maintainers: (unknown)'

  const prompt = `Analyze this GitHub issue to determine if it has been answered/resolved and can be safely closed.

Issue Author: ${issue.authorLogin || 'Unknown'}
${maintainersInfo}

Issue Title: ${issue.title}

Issue Body:
${issue.body || '(no body)'}

Comments (indexed [0], [1], etc.):
${commentsText}

Determine if the issue is ANSWERED, meaning:
1. The issue author's problem has been solved (fix deployed, workaround provided, or question answered)
2. The author has confirmed the solution works, OR a maintainer has provided a definitive answer/fix
3. There are no outstanding questions or follow-ups needed

If answered, identify which comment index [0-${issue.comments.length - 1}] provided the answer.

Be conservative - only mark as answered if you're confident the issue can be closed.`

  const { object } = await generateObject({
    model: 'gpt-4o-mini',
    schema: z.object({
      answered: z.boolean().describe('Whether the issue has been answered and can be safely closed'),
      answerCommentIndex: z.number().nullable().describe(`Index of the comment that answered the issue (0-${issue.comments.length - 1}), or null if not answered`)
    }),
    prompt
  })

  // Map comment index to actual comment ID
  const answerCommentId = object.answered && object.answerCommentIndex !== null && object.answerCommentIndex < issue.comments.length
    ? issue.comments[object.answerCommentIndex]!.id
    : null

  return {
    answered: object.answered,
    answerCommentId
  }
}

function needsReanalysis(issue: IssueForAnalysis): boolean {
  // No previous analysis completed
  if (issue.analyzedAt === null) {
    // Check if analysis was stuck (started but never completed, e.g. server restart)
    if (issue.analyzingAt) {
      const cutoff = new Date(Date.now() - ANALYSIS_TIMEOUT_MS)
      // If analyzing started more than 5 minutes ago, it's stuck - retry
      return issue.analyzingAt < cutoff
    }
    return true
  }

  // Issue was updated after last analysis (e.g., new comment arrived)
  if (issue.updatedAt && issue.analyzedAt < issue.updatedAt) {
    return true
  }

  return false
}

function isCurrentlyAnalyzing(issue: IssueForAnalysis): boolean {
  if (!issue.analyzingAt) return false

  // Check if analysis started within the timeout window
  const cutoff = new Date(Date.now() - ANALYSIS_TIMEOUT_MS)
  return issue.analyzingAt > cutoff
}

async function saveAnalysis(issueId: number, result: AnalysisResult): Promise<void> {
  await db.update(schema.issues)
    .set({
      answered: result.answered,
      answerCommentId: result.answerCommentId,
      analyzedAt: new Date(),
      analyzingAt: null // Clear analyzing status
    })
    .where(eq(schema.issues.id, issueId))
}

export async function analyzeIssuesAnswered(issues: IssueForAnalysis[]): Promise<Map<number, AnalysisResult>> {
  const results = new Map<number, AnalysisResult>()

  if (issues.length === 0) return results

  // Filter out issues already being analyzed and those that don't need reanalysis
  const needsAnalysis: IssueForAnalysis[] = []

  for (const issue of issues) {
    // Skip if already being analyzed
    if (isCurrentlyAnalyzing(issue)) {
      console.log(`[AI] Skipping issue ${issue.id} - already being analyzed`)
      continue
    }

    if (needsReanalysis(issue)) {
      needsAnalysis.push(issue)
    } else {
      // Use cached result from database
      results.set(issue.id, {
        answered: issue.answered ?? false,
        answerCommentId: null
      })
    }
  }

  if (needsAnalysis.length === 0) return results

  console.log(`[AI] Analyzing ${needsAnalysis.length} issues`)
  // Mark issues as analyzing in DB
  await Promise.all(needsAnalysis.map(issue => _markAnalyzing(issue.id)))

  // TODO: Remove this to test the AI analysis
  return results

  // Analyze issues in parallel with concurrency limit
  const BATCH_SIZE = 5
  for (let i = 0; i < needsAnalysis.length; i += BATCH_SIZE) {
    const batch = needsAnalysis.slice(i, i + BATCH_SIZE)
    const batchResults = await Promise.all(
      batch.map(async (issue) => {
        try {
          const result = await analyzeIssueWithAI(issue)
          console.log(`[AI] Analyzed issue ${issue.id}:`, result)
          // Save to database (also clears analyzingAt)
          await saveAnalysis(issue.id, result)
          return { id: issue.id, result }
        } catch (error) {
          console.error(`[AI] Failed to analyze issue ${issue.id}:`, error)
          // Clear analyzing status on error
          await clearAnalyzing(issue.id)
          return {
            id: issue.id,
            result: { answered: false, answerCommentId: null }
          }
        }
      })
    )

    for (const { id, result } of batchResults) {
      results.set(id, result)
    }
  }

  return results
}
