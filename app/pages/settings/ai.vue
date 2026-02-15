<script setup lang="ts">
const toast = useToast()

// Fetch current settings
const { data: settings, refresh } = await useFetch('/api/settings')

// Fetch credits when token is configured
const { data: credits, execute: fetchCredits, status: creditsStatus } = useLazyFetch('/api/settings/credits', {
  default: () => null,
  immediate: Boolean(settings.value?.hasAiGatewayToken)
})

// AI model options (from https://vercel.com/ai-gateway/models)
const modelOptions = [
  // Anthropic
  { label: 'Claude Sonnet 4.5', value: 'anthropic/claude-sonnet-4.5', icon: 'i-simple-icons-anthropic', description: 'Best for reasoning and analysis. Recommended.' },
  { label: 'Claude Opus 4.5', value: 'anthropic/claude-opus-4.5', icon: 'i-simple-icons-anthropic', description: 'Most capable Anthropic model. Premium pricing.' },
  { label: 'Claude Haiku 4.5', value: 'anthropic/claude-haiku-4.5', icon: 'i-simple-icons-anthropic', description: 'Fastest Anthropic model. Good for simple tasks.' },
  // OpenAI
  { label: 'GPT-5.2', value: 'openai/gpt-5.2', icon: 'i-simple-icons-openai', description: 'Latest OpenAI flagship. Excellent all-around.' },
  { label: 'GPT-5 Mini', value: 'openai/gpt-5-mini', icon: 'i-simple-icons-openai', description: 'Compact and affordable. Good for completions.' },
  { label: 'GPT-4.1 Mini', value: 'openai/gpt-4.1-mini', icon: 'i-simple-icons-openai', description: 'Budget-friendly. Suitable for basic tasks.' },
  // Google
  { label: 'Gemini 3 Pro', value: 'google/gemini-3-pro-preview', icon: 'i-simple-icons-google', description: 'Google\'s latest pro model. Strong reasoning.' },
  { label: 'Gemini 3 Flash', value: 'google/gemini-3-flash', icon: 'i-simple-icons-google', description: 'Very fast responses. Great for completions.' },
  { label: 'Gemini 2.5 Flash', value: 'google/gemini-2.5-flash', icon: 'i-simple-icons-google', description: 'Fast and cost-effective. Good for simple tasks.' },
  // xAI
  { label: 'Grok Code Fast', value: 'xai/grok-code-fast-1', icon: 'i-simple-icons-x', description: 'Optimized for code. Fast responses.' }
]

const defaultModel = 'anthropic/claude-sonnet-4.5'

// Form state
const token = ref('')
const selectedModel = ref(defaultModel)
const saving = ref(false)
const showToken = ref(false)

// Initialize selected model from settings
watch(() => settings.value?.aiModel, (newModel) => {
  selectedModel.value = newModel || defaultModel
}, { immediate: true })

// Computed state
const hasToken = computed(() => settings.value?.hasAiGatewayToken ?? false)

async function saveToken() {
  saving.value = true

  try {
    await $fetch('/api/settings', {
      method: 'PATCH',
      body: {
        aiGatewayToken: token.value || null
      }
    })

    await refresh()
    // Refresh credits if token was set
    if (token.value) {
      fetchCredits()
    }
    token.value = ''
    showToken.value = false

    toast.add({
      title: hasToken.value ? 'Token updated' : 'Token removed',
      description: hasToken.value
        ? 'Your Vercel AI Gateway token has been saved.'
        : 'Your Vercel AI Gateway token has been removed.',
      color: 'success'
    })
  } catch (error: any) {
    toast.add({
      title: 'Failed to save',
      description: error.data?.message || 'An error occurred while saving your settings.',
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}

async function removeToken() {
  saving.value = true

  try {
    await $fetch('/api/settings', {
      method: 'PATCH',
      body: {
        aiGatewayToken: null
      }
    })

    await refresh()

    toast.add({
      title: 'Token removed',
      description: 'Your Vercel AI Gateway token has been removed.',
      color: 'success'
    })
  } catch (error: any) {
    toast.add({
      title: 'Failed to remove',
      description: error.data?.message || 'An error occurred.',
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}

async function saveModel() {
  saving.value = true

  try {
    await $fetch('/api/settings', {
      method: 'PATCH',
      body: {
        aiModel: selectedModel.value
      }
    })

    await refresh()

    toast.add({
      title: 'Model updated',
      description: 'Your preferred AI model has been saved.',
      color: 'success'
    })
  } catch (error: any) {
    toast.add({
      title: 'Failed to save',
      description: error.data?.message || 'An error occurred while saving your settings.',
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="flex flex-col flex-1 min-h-0">
    <UPageCard
      title="AI Gateway"
      description="Configure your Vercel AI Gateway token to enable AI-powered features."
      variant="naked"
      orientation="horizontal"
      class="mb-4"
      :ui="{ title: 'leading-7', container: 'flex! flex-row! gap-0! items-start!' }"
    />

    <UCard class="overflow-y-auto" :ui="{ header: 'sm:px-4', body: 'sm:p-4', footer: 'p-0!' }">
      <template #header>
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <div class="flex items-center justify-center size-10 rounded-lg bg-elevated">
              <UIcon
                :name="hasToken ? 'i-lucide-check-circle' : 'i-lucide-alert-circle'"
                :class="hasToken ? 'text-success' : 'text-warning'"
                class="size-5"
              />
            </div>
            <div>
              <p class="font-medium">
                {{ hasToken ? 'Token configured' : 'Token not configured' }}
              </p>
              <p class="text-sm text-muted">
                {{ hasToken
                  ? 'AI features are enabled for your account.'
                  : 'Add your Vercel AI Gateway token to enable AI features.'
                }}
              </p>
            </div>
          </div>

          <!-- Credits display -->
          <UBadge v-if="hasToken && credits" variant="soft" icon="i-lucide-coins">
            {{ Number(credits.balance).toLocaleString('en-US', { style: 'currency', currency: 'USD' }) }} in credits
          </UBadge>
          <UBadge
            v-else-if="hasToken && creditsStatus === 'pending'"
            variant="soft"
            icon="i-lucide-coins"
            class="animate-pulse"
          >
            Loading...
          </UBadge>
        </div>
      </template>

      <template #default>
        <UFormField label="AI Gateway Token" size="md" class="mb-4">
          <template #hint>
            <UButton
              to="https://vercel.com/d?to=/%5Bteam%5D/~/ai-gateway/api-keys&title=AI+Gateway+API+Keys"
              target="_blank"
              trailing-icon="i-lucide-arrow-up-right"
              variant="link"
              square
              color="primary"
            >
              Get a token
            </UButton>
          </template>

          <UInput
            v-model="token"
            :type="showToken ? 'text' : 'password'"
            :placeholder="hasToken ? '••••••••••••••••' : 'Enter your Vercel AI Gateway token'"
            class="w-full"
            variant="soft"
          >
            <template #trailing>
              <UButton
                v-if="token"
                :icon="showToken ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                variant="ghost"
                color="neutral"
                size="xs"
                class="-me-1"
                @click="showToken = !showToken"
              />
            </template>
          </UInput>
        </UFormField>

        <!-- Token Actions -->
        <div class="flex items-center justify-end gap-2 mb-6">
          <UButton
            v-if="hasToken"
            label="Remove token"
            variant="soft"
            color="error"
            :loading="saving"
            @click="removeToken"
          />

          <UButton
            :label="hasToken ? 'Update token' : 'Save token'"
            :loading="saving"
            :variant="token ? 'solid' : 'soft'"
            :disabled="!token"
            @click="saveToken"
          />
        </div>

        <USeparator class="mb-6" />

        <UFormField label="AI Model" size="md" class="mb-4">
          <template #description>
            Select the AI model to use for resolution analysis and completions.
          </template>

          <USelectMenu
            v-model="selectedModel"
            :items="modelOptions"
            :icon="modelOptions.find(model => model.value === selectedModel)?.icon"
            :search-input="{ icon: 'i-lucide-search', placeholder: 'Search models...', ui: { base: 'py-3' } }"
            :filter-fields="['label', 'description']"
            size="md"
            value-key="value"
            variant="soft"
            class="w-full data-[state=open]:bg-elevated"
            :ui="{ content: 'max-h-92', empty: 'py-6' }"
          />
        </UFormField>

        <!-- Model Actions -->
        <div class="flex items-center justify-end gap-2">
          <UButton
            label="Save model"
            :loading="saving"
            :variant="selectedModel === (settings?.aiModel || defaultModel) ? 'soft' : 'solid'"
            :disabled="selectedModel === (settings?.aiModel || defaultModel)"
            @click="saveModel"
          />
        </div>
      </template>

      <template #footer>
        <UAlert
          icon="i-lucide-info"
          color="primary"
          variant="soft"
          description="AI features include automatic issue resolution analysis (detecting if issues have been answered) and smart comment suggestions. Your Vercel AI Gateway token is stored securely and only used for AI requests on your behalf."
          :ui="{ icon: 'size-4 mt-0.5' }"
          class="rounded-none"
        />
      </template>
    </UCard>
  </div>
</template>
