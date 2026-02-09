import { ToolLoopAgent, stepCountIs } from 'ai'
import { createSavoir } from '@savoir/sdk'
import { eq, and } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'

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
        limit: 20
      }
    }
  })

  if (!issue) {
    throw createError({ statusCode: 404, message: 'Issue not found' })
  }

  // Get user's AI settings (token and model)
  const { token: userToken, model: userModel } = await getUserAiSettings(user.id)
  const userGateway = createUserGateway(userToken)

  if (!userGateway) {
    throw createError({
      statusCode: 403,
      message: 'Vercel AI Gateway token not configured. Add your token in Settings to enable AI features.'
    })
  }

  // Get Savoir config from runtime
  const { savoir: savoirConfig } = useRuntimeConfig()

  if (!savoirConfig.apiUrl) {
    throw createError({ statusCode: 500, message: 'Savoir API is not configured' })
  }

  // Init Savoir SDK
  const savoir = createSavoir({
    apiUrl: savoirConfig.apiUrl,
    apiKey: savoirConfig.apiKey || undefined
  })

  // Optionally fetch agent config for custom instructions
  let agentInstructions = ''
  try {
    const agentConfig = await savoir.getAgentConfig()
    if (agentConfig?.additionalPrompt) {
      agentInstructions = agentConfig.additionalPrompt
    }
  } catch {
    // Ignore - agent config is optional
  }

  // Build issue context
  const issueContext = buildIssueContext(issue, repository)

  // Create agent with Savoir tools
  const agent = new ToolLoopAgent({
    model: userGateway(userModel),
    instructions: `You are a documentation assistant that helps answer GitHub issues by searching project documentation.

${agentInstructions}

Use the bash tool to search the documentation and find relevant information. Common commands:
- \`find . -name "*.md" | head -20\` to discover documentation files
- \`grep -r "keyword" --include="*.md" -l\` to find files mentioning a topic
- \`cat path/to/file.md\` to read documentation content

CRITICAL OUTPUT RULES:
- Your final response will be posted DIRECTLY as a GitHub comment. Write ONLY the comment body.
- Do NOT include any preamble, thinking, or meta-commentary (e.g. "Let me search...", "Perfect! Now I have...", "Response to Issue #X").
- Do NOT include a title or heading at the top of your response.
- Start directly with the helpful content addressing the issue.
- Use markdown formatting appropriate for a GitHub comment.
- Be concise and actionable.
- Include relevant code examples or configuration snippets from the docs.
- Reference specific documentation pages when applicable.

Here is the issue context:

${issueContext}`,
    tools: savoir.tools,
    stopWhen: stepCountIs(12)
  })

  const result = await agent.generate({
    prompt: `Search the documentation to find information relevant to this issue and write a helpful response that can be posted directly as a GitHub comment.

Issue #${issue.number}: ${issue.title}
${issue.body ? `\n${issue.body}` : ''}`
  })

  return { response: result.text }
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
