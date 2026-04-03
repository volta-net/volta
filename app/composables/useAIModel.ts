export const aiModelOptions = [
  // Anthropic
  { label: 'Claude Opus 4.6', value: 'anthropic/claude-opus-4.6', icon: 'i-simple-icons-anthropic', description: 'Most capable model. Best for analysis. Premium pricing.' },
  { label: 'Claude Sonnet 4.6', value: 'anthropic/claude-sonnet-4.6', icon: 'i-simple-icons-anthropic', description: 'Best balance of speed and quality. Recommended.' },
  { label: 'Claude Haiku 4.5', value: 'anthropic/claude-haiku-4.5', icon: 'i-simple-icons-anthropic', description: 'Fastest Anthropic model. Great for completions.' },
  // OpenAI
  { label: 'GPT-5.4', value: 'openai/gpt-5.4', icon: 'i-simple-icons-openai', description: 'OpenAI flagship. Strong structured output.' },
  { label: 'GPT-5.4 Mini', value: 'openai/gpt-5.4-mini', icon: 'i-simple-icons-openai', description: 'Fast and affordable. Good for completions.' },
  { label: 'GPT-5.4 Nano', value: 'openai/gpt-5.4-nano', icon: 'i-simple-icons-openai', description: 'Ultra fast. Most cost-effective OpenAI model.' },
  // Google
  { label: 'Gemini 3.1 Pro', value: 'google/gemini-3.1-pro-preview', icon: 'i-simple-icons-google', description: 'Strongest Google model. Good for analysis.' },
  { label: 'Gemini 3 Flash', value: 'google/gemini-3-flash', icon: 'i-simple-icons-google', description: 'Very fast with 1M context. Best value.' }
]

export const aiDefaultModel = 'anthropic/claude-sonnet-4.6'
