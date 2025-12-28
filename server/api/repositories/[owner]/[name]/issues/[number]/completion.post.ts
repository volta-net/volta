import { streamText } from 'ai'
import { gateway } from '@ai-sdk/gateway'
import { eq, and } from 'drizzle-orm'
import { db, schema } from 'hub:db'

function buildContextPrompt(repository: { fullName: string, description: string | null }, issue: { number: number, title: string, pullRequest: boolean, labels: { name: string }[] }): string {
  const parts: string[] = []

  parts.push(`Repository: ${repository.fullName}`)
  if (repository.description) {
    parts.push(`Description: ${repository.description}`)
  }

  const type = issue.pullRequest ? 'Pull Request' : 'Issue'
  parts.push(`${type} #${issue.number}: ${issue.title}`)
  if (issue.labels.length) {
    parts.push(`Labels: ${issue.labels.map(l => l.name).join(', ')}`)
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

  // Find issue by repository + number with labels
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
      }
    }
  })

  if (!issue) {
    throw createError({ statusCode: 404, message: 'Issue not found' })
  }

  // Parse request body
  const { prompt, mode, language } = await readBody<{
    prompt: string
    mode?: string
    language?: string
  }>(event)

  if (!prompt) {
    throw createError({ statusCode: 400, message: 'Prompt is required' })
  }

  let system: string
  let maxOutputTokens: number

  const preserveMarkdown = 'IMPORTANT: Preserve all markdown formatting (bold, italic, links, etc.) exactly as in the original.'
  const contextPrompt = buildContextPrompt(
    { fullName: repository.fullName, description: repository.description },
    {
      number: issue.number,
      title: issue.title,
      pullRequest: issue.pullRequest,
      labels: issue.labels.map(l => ({ name: l.label.name }))
    }
  )

  const isPR = issue.pullRequest

  switch (mode) {
    case 'fix':
      system = `You are a writing assistant. Fix all spelling and grammar errors in the given text. ${preserveMarkdown} Only output the corrected text, nothing else.`
      maxOutputTokens = 500
      break
    case 'extend':
      system = `You are a writing assistant helping with GitHub ${isPR ? 'pull requests' : 'issues'}. Extend the given text with more details, examples, and explanations while maintaining the same style. ${preserveMarkdown} Only output the extended text, nothing else.${contextPrompt}`
      maxOutputTokens = 500
      break
    case 'reduce':
      system = `You are a writing assistant. Make the given text more concise by removing unnecessary words while keeping the meaning. ${preserveMarkdown} Only output the reduced text, nothing else.`
      maxOutputTokens = 300
      break
    case 'simplify':
      system = `You are a writing assistant. Simplify the given text to make it easier to understand, using simpler words and shorter sentences. ${preserveMarkdown} Only output the simplified text, nothing else.`
      maxOutputTokens = 400
      break
    case 'summarize':
      system = 'You are a writing assistant. Summarize the given text concisely while keeping the key points. Only output the summary, nothing else.'
      maxOutputTokens = 200
      break
    case 'translate':
      system = `You are a writing assistant. Translate the given text to ${language || 'English'}. ${preserveMarkdown} Only output the translated text, nothing else.`
      maxOutputTokens = 500
      break
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
      maxOutputTokens = 25
      break
  }

  return streamText({
    model: gateway('openai/gpt-4o-mini'),
    system,
    prompt,
    maxOutputTokens
  }).toTextStreamResponse()
})
