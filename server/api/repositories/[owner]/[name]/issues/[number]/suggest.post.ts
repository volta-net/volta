import { generateText, Output } from 'ai'
import type { GatewayModelId } from '@ai-sdk/gateway'
import { z } from 'zod'
import { eq, and, ne, desc } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'

// Schemas for AI responses
const labelSuggestionSchema = z.object({
  suggestions: z.array(z.object({
    name: z.string().describe('The label name exactly as provided in the available labels'),
    action: z.enum(['add', 'remove']).describe('Whether to add or remove this label'),
    reason: z.string().describe('Brief explanation why this label should be added or removed')
  }))
})

const titleSuggestionSchema = z.object({
  title: z.string().describe('The suggested title'),
  reason: z.string().describe('Brief explanation of the improvement')
})

const duplicateSuggestionSchema = z.object({
  duplicates: z.array(z.object({
    number: z.number().describe('The issue number'),
    reason: z.string().describe('Brief explanation of why this might be a duplicate')
  }))
})

type SuggestMode = 'labels' | 'title' | 'duplicates'

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

  // Parse request body
  const { mode } = await readBody<{ mode: SuggestMode }>(event)

  if (!mode || !['labels', 'title', 'duplicates'].includes(mode)) {
    throw createError({ statusCode: 400, message: 'Mode is required (labels, title, or duplicates)' })
  }

  // Find repository
  const fullName = `${owner}/${name}`
  const repository = await db.query.repositories.findFirst({
    where: eq(schema.repositories.fullName, fullName)
  })

  if (!repository) {
    throw createError({ statusCode: 404, message: 'Repository not found' })
  }

  // Check user has access
  await requireRepositoryAccess(user.id, repository.id)

  // Find issue with labels and comments
  const issue = await db.query.issues.findFirst({
    where: and(
      eq(schema.issues.repositoryId, repository.id),
      eq(schema.issues.number, issueNumber)
    ),
    with: {
      labels: {
        with: {
          label: true
        }
      },
      comments: {
        with: {
          user: true
        },
        orderBy: (comments, { asc }) => [asc(comments.createdAt)],
        limit: 20 // Limit comments to keep context manageable
      }
    }
  })

  if (!issue) {
    throw createError({ statusCode: 404, message: 'Issue not found' })
  }

  // Get user's AI token
  const userToken = await getUserAiToken(user.id)
  const userGateway = createUserGateway(userToken)

  if (!userGateway) {
    throw createError({
      statusCode: 403,
      message: 'Vercel AI Gateway token not configured. Add your token in Settings to enable AI features.'
    })
  }

  // Build issue context for all modes
  const issueContext = buildIssueContext(issue, repository)

  switch (mode) {
    case 'labels':
      return await suggestLabels(issue, repository, issueContext, userGateway)
    case 'title':
      return await suggestTitle(issue, issueContext, userGateway)
    case 'duplicates':
      return await findDuplicates(issue, repository, issueContext, userGateway)
    default:
      throw createError({ statusCode: 400, message: 'Invalid mode' })
  }
})

function buildIssueContext(
  issue: {
    number: number
    title: string
    body: string | null
    pullRequest: boolean
    labels: { label: { name: string } }[]
    comments: { user: { login: string } | null, body: string }[]
  },
  repository: { fullName: string, description: string | null }
): string {
  const parts: string[] = []

  parts.push(`Repository: ${repository.fullName}`)
  if (repository.description) {
    parts.push(`Description: ${repository.description}`)
  }

  const type = issue.pullRequest ? 'Pull Request' : 'Issue'
  parts.push(`\n${type} #${issue.number}: ${issue.title}`)

  if (issue.body) {
    parts.push(`\nBody:\n${issue.body}`)
  }

  if (issue.labels.length > 0) {
    parts.push(`\nCurrent labels: ${issue.labels.map(l => l.label.name).join(', ')}`)
  }

  if (issue.comments.length > 0) {
    parts.push(`\nComments (${issue.comments.length}):`)
    for (const comment of issue.comments.slice(0, 10)) {
      const author = comment.user?.login ?? 'unknown'
      parts.push(`@${author}: ${comment.body.slice(0, 500)}${comment.body.length > 500 ? '...' : ''}`)
    }
  }

  return parts.join('\n')
}

async function suggestLabels(
  issue: { id: number, labels: { label: { id: number, name: string, color: string } }[] },
  repository: { id: number },
  issueContext: string,
  userGateway: ReturnType<typeof createUserGateway>
) {
  // Fetch all available labels for this repository
  const availableLabels = await db.query.labels.findMany({
    where: eq(schema.labels.repositoryId, repository.id),
    orderBy: (labels, { asc }) => [asc(labels.name)]
  })

  if (availableLabels.length === 0) {
    return { suggestions: [] }
  }

  // Get current labels on the issue
  const currentLabels = issue.labels.map(l => l.label)
  const currentLabelNames = new Set(currentLabels.map(l => l.name.toLowerCase()))

  // Labels that can be added (not currently on the issue)
  const labelsToAdd = availableLabels.filter(l => !currentLabelNames.has(l.name.toLowerCase()))

  // Build prompt sections
  const addSection = labelsToAdd.length > 0
    ? `Labels that can be ADDED:\n${labelsToAdd.map(l => `- ${l.name}${l.description ? `: ${l.description}` : ''}`).join('\n')}`
    : ''

  const removeSection = currentLabels.length > 0
    ? `Labels currently on the issue (can be REMOVED if inappropriate):\n${currentLabels.map(l => `- ${l.name}`).join('\n')}`
    : ''

  if (!addSection && !removeSection) {
    return { suggestions: [] }
  }

  const systemPrompt = `You are an AI that suggests label changes for GitHub issues based on their content.

${addSection}

${removeSection}

Rules:
- Only suggest labels from the lists above
- Use EXACT label names as shown
- For each suggestion, specify whether to "add" or "remove" the label
- Suggest adding labels that clearly apply based on the issue content
- Suggest removing labels that no longer apply or were incorrectly assigned
- Be conservative - don't suggest changes unless you're confident
- Consider the issue title, body, and comments
- Maximum 3-4 total suggestions`

  const { output } = await generateText({
    model: userGateway!('anthropic/claude-sonnet-4.5' as GatewayModelId),
    output: Output.object({ schema: labelSuggestionSchema }),
    system: systemPrompt,
    prompt: issueContext
  })

  // Map suggestions to include label IDs and colors
  const allLabelsMap = new Map(availableLabels.map(l => [l.name.toLowerCase(), l]))
  const suggestions = output.suggestions
    .map((s) => {
      const label = allLabelsMap.get(s.name.toLowerCase())
      if (!label) return null

      // Validate action matches current state
      const isCurrentlyApplied = currentLabelNames.has(s.name.toLowerCase())
      if (s.action === 'add' && isCurrentlyApplied) return null
      if (s.action === 'remove' && !isCurrentlyApplied) return null

      return {
        id: label.id,
        name: label.name,
        color: label.color,
        reason: s.reason,
        action: s.action as 'add' | 'remove'
      }
    })
    .filter((s): s is NonNullable<typeof s> => s !== null)

  return { suggestions }
}

async function suggestTitle(
  issue: { title: string },
  issueContext: string,
  userGateway: ReturnType<typeof createUserGateway>
) {
  const systemPrompt = `You are an AI that improves GitHub issue titles to be clearer and more descriptive.

Rules:
- Keep titles concise (ideally under 80 characters)
- Make the problem or request clear from the title alone
- Use active voice when possible
- Don't use vague words like "issue", "problem", "bug" without specifics
- Preserve technical terms and component names
- If the current title is already good, suggest a minor improvement or the same title

Current title: "${issue.title}"`

  const { output } = await generateText({
    model: userGateway!('anthropic/claude-sonnet-4.5' as GatewayModelId),
    output: Output.object({ schema: titleSuggestionSchema }),
    system: systemPrompt,
    prompt: issueContext
  })

  return output
}

async function findDuplicates(
  issue: { id: number, number: number, title: string, body: string | null },
  repository: { id: number },
  issueContext: string,
  userGateway: ReturnType<typeof createUserGateway>
) {
  // Fetch other open issues from the same repository
  const otherIssues = await db.query.issues.findMany({
    where: and(
      eq(schema.issues.repositoryId, repository.id),
      eq(schema.issues.pullRequest, false),
      ne(schema.issues.id, issue.id)
    ),
    orderBy: desc(schema.issues.updatedAt),
    limit: 50, // Limit to recent issues to keep context manageable
    columns: {
      id: true,
      number: true,
      title: true,
      body: true,
      state: true,
      htmlUrl: true
    }
  })

  if (otherIssues.length === 0) {
    return { duplicates: [] }
  }

  const systemPrompt = `You are an AI that finds potential duplicate GitHub issues.

Your task is to identify issues from the list below that might be duplicates of the current issue.

Other issues in this repository:
${otherIssues.map(i => `#${i.number} [${i.state}]: ${i.title}${i.body ? `\n   ${i.body.slice(0, 200)}${i.body.length > 200 ? '...' : ''}` : ''}`).join('\n\n')}

Rules:
- Only flag issues that describe the SAME problem or request
- Similar topics are NOT duplicates - the actual issue must be the same
- Be conservative - only suggest clear duplicates
- Consider both open and closed issues (closed issues might have solutions)
- Maximum 3 suggestions`

  const { output } = await generateText({
    model: userGateway!('anthropic/claude-sonnet-4.5' as GatewayModelId),
    output: Output.object({ schema: duplicateSuggestionSchema }),
    system: systemPrompt,
    prompt: issueContext
  })

  // Map to include issue details
  const issueMap = new Map(otherIssues.map(i => [i.number, i]))
  const duplicates = output.duplicates
    .map((d) => {
      const foundIssue = issueMap.get(d.number)
      if (!foundIssue) return null
      return {
        id: foundIssue.id,
        number: foundIssue.number,
        title: foundIssue.title,
        state: foundIssue.state,
        htmlUrl: foundIssue.htmlUrl,
        reason: d.reason
      }
    })
    .filter((d): d is NonNullable<typeof d> => d !== null)

  return { duplicates }
}
