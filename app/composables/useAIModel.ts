export const aiModelOptions = [
  // Anthropic
  { label: 'Claude Opus 5', value: 'anthropic/claude-opus-5', icon: 'i-simple-icons-anthropic', description: 'Most capable model. Best for issue analysis and draft replies. $5 in / $25 out.' },
  { label: 'Claude Sonnet 5', value: 'anthropic/claude-sonnet-5', icon: 'i-simple-icons-anthropic', description: 'Best balance of speed and quality. Recommended. $2 in / $10 out.' },
  { label: 'Claude Haiku 4.5', value: 'anthropic/claude-haiku-4.5', icon: 'i-simple-icons-anthropic', description: 'Fastest Anthropic model. Great for completions. $1 in / $5 out.' },
  // OpenAI
  { label: 'GPT-5.6 Sol', value: 'openai/gpt-5.6-sol', icon: 'i-simple-icons-openai', description: 'OpenAI flagship. Strong tool use and structured output. $2 in / $10 out.' },
  { label: 'GPT-5.6 Terra', value: 'openai/gpt-5.6-terra', icon: 'i-simple-icons-openai', description: 'Balanced model for everyday work. $2 in / $12 out.' },
  { label: 'GPT-5.6 Luna', value: 'openai/gpt-5.6-luna', icon: 'i-simple-icons-openai', description: 'Fast and cheap. Good for completions and bulk analysis. $0.20 in / $1.20 out.' },
  // Google
  { label: 'Gemini 3.8 Flash', value: 'google/gemini-3.8-flash', icon: 'i-simple-icons-google', description: 'Very fast with 1M context. Best value. $0.75 in / $3.75 out.' }
]

export const aiDefaultModel = 'anthropic/claude-sonnet-5'
