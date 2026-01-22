import { streamText } from 'ai'
import type { GatewayModelId } from '@ai-sdk/gateway'
import { eq, and, inArray, desc, ne, isNotNull } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'

/**
 * Fetch user's recent comments from other issues to analyze their writing style
 */
async function getUserStyleExamples(userId: number, excludeIssueId: number, limit = 10): Promise<string[]> {
  const recentComments = await db.query.issueComments.findMany({
    where: and(
      eq(schema.issueComments.userId, userId),
      ne(schema.issueComments.issueId, excludeIssueId),
      isNotNull(schema.issueComments.body)
    ),
    orderBy: [desc(schema.issueComments.createdAt)],
    limit
  })

  return recentComments
    .map(c => c.body)
    .filter((body): body is string => !!body && body.length > 0 && body.length < 1000)
}

function buildContextPrompt(
  repository: { fullName: string, description: string | null, htmlUrl: string | null },
  issue: {
    number: number
    title: string
    body: string | null
    pullRequest: boolean
    labels: { name: string }[]
    comments: { author: string, body: string, isMaintainer: boolean }[]
  }
): string {
  const parts: string[] = []

  parts.push(`Repository: ${repository.fullName}`)
  if (repository.htmlUrl) {
    parts.push(`URL: ${repository.htmlUrl}`)
  }
  if (repository.description) {
    parts.push(`Description: ${repository.description}`)
  }

  const type = issue.pullRequest ? 'Pull Request' : 'Issue'
  parts.push(`${type} #${issue.number}: ${issue.title}`)
  if (issue.body) {
    parts.push(`Body:\n${issue.body}`)
  }
  if (issue.labels.length) {
    parts.push(`Labels: ${issue.labels.map(l => l.name).join(', ')}`)
  }
  if (issue.comments.length) {
    parts.push(`\nComment history:`)
    for (const comment of issue.comments) {
      const role = comment.isMaintainer ? ' [maintainer]' : ''
      parts.push(`@${comment.author}${role}: ${comment.body}`)
    }
  }

  return `\n\nCONTEXT (use this to provide relevant suggestions):\n${parts.join('\n')}`
}

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

  // Find issue by repository + number with labels and comments
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
        orderBy: (comments, { asc }) => [asc(comments.createdAt)]
      }
    }
  })

  if (!issue) {
    throw createError({ statusCode: 404, message: 'Issue not found' })
  }

  // Get maintainer user IDs (collaborators with write access or higher)
  const maintainerPermissions = ['admin', 'maintain', 'write'] as const
  const collaborators = await db.query.repositoryCollaborators.findMany({
    where: and(
      eq(schema.repositoryCollaborators.repositoryId, repository.id),
      inArray(schema.repositoryCollaborators.permission, [...maintainerPermissions])
    )
  })
  const maintainerIds = new Set(collaborators.map(c => c.userId))

  // Parse request body
  const { prompt, mode, language } = await readBody<{
    prompt: string
    mode?: string
    language?: string
  }>(event)

  if (!prompt) {
    throw createError({ statusCode: 400, message: 'Prompt is required' })
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

  let system: string
  let maxOutputTokens: number

  const preserveMarkdown = 'IMPORTANT: Preserve all markdown formatting (bold, italic, links, etc.) exactly as in the original.'
  const contextPrompt = buildContextPrompt(
    { fullName: repository.fullName, description: repository.description, htmlUrl: repository.htmlUrl },
    {
      number: issue.number,
      title: issue.title,
      body: issue.body,
      pullRequest: issue.pullRequest,
      labels: issue.labels.map(l => ({ name: l.label.name })),
      comments: issue.comments.map(c => ({
        author: c.user?.login ?? 'unknown',
        body: c.body,
        isMaintainer: c.userId ? maintainerIds.has(c.userId) : false
      }))
    }
  )

  const isPR = issue.pullRequest

  switch (mode) {
    case 'fix':
      system = `You are a writing assistant for GitHub. Fix spelling and grammar errors in the given text.

Rules:
- Fix typos, grammar, and punctuation
- Wrap inline code (variables, functions, file paths, commands, package names) with single backticks
- Wrap multi-line code blocks with triple backticks and appropriate language identifier
- DO NOT "correct" technical terms, library names, or intentional abbreviations (e.g., "repo", "config", "env")
- ${preserveMarkdown}

Only output the corrected text, nothing else.`
      maxOutputTokens = 500
      break
    case 'simplify':
      system = `You are a writing assistant for GitHub ${isPR ? 'pull requests' : 'issues'}. Simplify the given text to make it easier to understand.

Rules:
- Use simpler words and shorter sentences
- Keep technical terms that are necessary (don't replace "API" with "interface", etc.)
- Preserve code snippets exactly as-is
- ${preserveMarkdown}

Only output the simplified text, nothing else.`
      maxOutputTokens = 400
      break
    case 'summarize':
      system = `You are a writing assistant for GitHub ${isPR ? 'pull requests' : 'issues'}. Summarize the given text concisely.

Prioritize:
- The main problem or request
- Key technical details (error messages, versions, steps to reproduce)
- Proposed solutions or next steps

Keep it brief (2-4 sentences max). Only output the summary, nothing else.`
      maxOutputTokens = 200
      break
    case 'translate':
      system = `You are a writing assistant. Translate the given text to ${language || 'English'}.

Rules:
- Translate prose and explanations
- DO NOT translate: code, variable names, function names, file paths, CLI commands, package names, error messages
- Keep technical terms in their commonly-used form (some terms like "pull request", "commit", "merge" are often kept in English even in other languages)
- ${preserveMarkdown}

Only output the translated text, nothing else.`
      maxOutputTokens = 500
      break
    case 'reply': {
      // Fetch user's recent comments to match their writing style
      const userStyleExamples = await getUserStyleExamples(user.id, issue.id)

      let styleGuidance = ''
      if (userStyleExamples.length > 0) {
        styleGuidance = `\n\nIMPORTANT - Match this user's writing style based on their previous comments:
${userStyleExamples.map((ex, i) => `Example ${i + 1}: "${ex.slice(0, 300)}${ex.length > 300 ? '...' : ''}"`).join('\n')}

Match the tone, length, and style of these examples.`
      }

      system = `You are drafting a GitHub comment ON BEHALF of a user. The comment will be posted as if THEY wrote it - NOT as an AI assistant.

CRITICAL: Write as the user, not as an AI. Never say "I'm an AI" or refer to yourself. This is their voice.

Based on the ${isPR ? 'PR' : 'issue'} context, write a SHORT, CASUAL reply that:
- Gets straight to the point (1-3 sentences is usually enough)
- Sounds natural and human - like a quick comment between developers
- Uses casual language (contractions, informal tone)
- Only includes code if absolutely necessary
- Avoids corporate-speak, filler phrases, or overly formal language

Response types:
- Question? Give a quick, direct answer using your knowledge of this project
- Bug report? Ask one clarifying question or suggest a quick fix
- Feature request? Brief acknowledgment + maybe one follow-up question
- Discussion? Add a short, relevant thought

Keep it SHORT. Most GitHub comments are 1-3 sentences. Don't over-explain.
Use your training knowledge about this repository to provide accurate, project-specific answers.

Only output the reply text itself, nothing else. No preamble, no explanation, no "Here's a reply:" - just the comment.
${contextPrompt}${styleGuidance}`
      maxOutputTokens = 200
      break
    }
    case 'continue':
    default:
      system = `You are a writing assistant helping with GitHub ${isPR ? 'pull requests' : 'issues'}.
CRITICAL RULES:
- Output ONLY the NEW text that comes AFTER the user's input
- NEVER repeat any words from the end of the user's text
- Keep completions short (1 sentence max)
- Match the tone and style of the existing text
- Provide contextually relevant suggestions based on the repository and issue context
- ${preserveMarkdown}${contextPrompt}`
      maxOutputTokens = 40
      break
  }

  return streamText({
    model: userGateway('anthropic/claude-sonnet-4.5' as GatewayModelId),
    system,
    prompt,
    maxOutputTokens
  }).toTextStreamResponse()
})
