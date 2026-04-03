<script setup lang="ts">
import type { UIMessage } from 'ai'
import { DefaultChatTransport, isToolUIPart, isReasoningUIPart, isTextUIPart, getToolName } from 'ai'
import { Chat } from '@ai-sdk/vue'
import { isPartStreaming, isToolStreaming } from '@nuxt/ui/utils/ai'

useSeoMeta({
  title: 'Home'
})

const toast = useToast()
const { refresh: refreshFavoriteRepositories } = useFavoriteRepositories()

const { data: settings, refresh } = useLazyFetch('/api/settings')
const hasToken = computed(() => settings.value?.hasAiGatewayToken ?? false)

const selectedModel = ref(aiDefaultModel)

watch(() => settings.value?.aiModel, (val) => {
  selectedModel.value = val || aiDefaultModel
}, { immediate: true })

async function onModelChange(value: string) {
  selectedModel.value = value
  try {
    await $fetch('/api/settings', {
      method: 'PATCH',
      body: { aiModel: value }
    })
    await refresh()
  } catch (error: any) {
    toast.add({
      description: error.data?.message || 'An error occurred while saving your settings.',
      icon: 'i-lucide-alert-circle',
      color: 'error',
      duration: 0
    })
  }
}

const input = ref('')
const storedMessages = useLocalStorage<UIMessage[]>('volta-chat-messages', [])

const chat = new Chat({
  messages: storedMessages.value,
  transport: new DefaultChatTransport({
    api: '/api/chat'
  }),
  onError: (error) => {
    let message = error.message
    if (typeof message === 'string' && message[0] === '{') {
      try {
        message = JSON.parse(message).message || message
      } catch {
        // keep original
      }
    }

    toast.add({
      description: message,
      icon: 'i-lucide-alert-circle',
      color: 'error',
      duration: 0
    })
  }
})

function onSubmit() {
  if (!input.value.trim()) return

  const isFirstMessage = !chat.messages.length

  if (isFirstMessage && document.startViewTransition) {
    document.startViewTransition(() => {
      chat.sendMessage({ text: input.value })
      input.value = ''
    })
  } else {
    chat.sendMessage({ text: input.value })
    input.value = ''
  }
}

function askQuestion(question: string) {
  input.value = question
  onSubmit()
}

watch(() => chat.messages, (messages) => {
  storedMessages.value = messages

  const last = messages[messages.length - 1]
  if (last?.role === 'assistant') {
    const hasCompletedFavoriteTool = last.parts.some(
      p => isToolUIPart(p) && getToolName(p as any) === 'manageFavorites' && !isToolStreaming(p)
    )
    if (hasCompletedFavoriteTool) {
      refreshFavoriteRepositories()
    }
  }
}, { deep: true })

function clearMessages() {
  if (chat.status === 'streaming') {
    chat.stop()
  }
  chat.messages = []
}

const toolLabels: Record<string, { searching: string, searched: string, icon: string }> = {
  searchIssues: { searching: 'Searching issues...', searched: 'Searched issues', icon: 'i-lucide-search' },
  getNotifications: { searching: 'Fetching notifications...', searched: 'Fetched notifications', icon: 'i-lucide-bell' },
  getIssueStats: { searching: 'Loading stats...', searched: 'Loaded stats', icon: 'i-lucide-bar-chart-3' },
  getIssueDetails: { searching: 'Reading issue...', searched: 'Read issue', icon: 'i-lucide-file-text' },
  listRepositories: { searching: 'Listing repositories...', searched: 'Listed repositories', icon: 'i-lucide-book' },
  manageFavorites: { searching: 'Updating favorites...', searched: 'Updated favorites', icon: 'i-lucide-star' },
  analyzeIssues: { searching: 'Analyzing issues...', searched: 'Analyzed issues', icon: 'i-lucide-sparkles' },
  generateChart: { searching: 'Generating chart...', searched: 'Generated chart', icon: 'i-lucide-chart-pie' }
}

function getToolText(part: { state: string, toolName?: string, toolCallId?: string }) {
  const name = getToolName(part as any)
  const info = toolLabels[name]
  if (!info) return isToolStreaming(part) ? 'Working...' : 'Done'
  return isToolStreaming(part) ? info.searching : info.searched
}

function getToolIcon(part: { state: string, toolName?: string, toolCallId?: string }) {
  const name = getToolName(part as any)
  return toolLabels[name]?.icon || 'i-lucide-cpu'
}
</script>

<template>
  <UDashboardPanel
    class="relative min-h-0"
    :ui="{ body: 'p-0 sm:p-0 overscroll-none' }"
  >
    <template #header>
      <UDashboardNavbar class="border-b-0 bg-transparent absolute inset-x-0">
        <template v-if="chat.messages.length" #right>
          <UTooltip text="Clear conversation">
            <UButton
              icon="i-lucide-list-x"
              variant="ghost"
              color="neutral"
              @click="clearMessages"
            />
          </UTooltip>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="!hasToken" class="flex-1 flex flex-col items-center justify-center p-8">
        <UEmpty
          icon="i-lucide-sparkles"
          title="AI Gateway not configured"
          description="Add your Vercel AI Gateway token in settings to enable the AI assistant."
          variant="naked"
          size="xl"
          :actions="[{
            label: 'Configure AI',
            to: '/settings/ai',
            icon: 'i-lucide-settings',
            variant: 'subtle' as const
          }]"
        />
      </div>

      <template v-else>
        <!-- Empty state: welcome screen -->
        <div v-if="!chat.messages.length" class="flex-1 flex flex-col items-center justify-center gap-8 p-8">
          <div class="flex flex-col items-center gap-4">
            <AppIconAnimated :size="340" class="absolute -translate-y-1/2 top-1/2 opacity-15 text-highlighted -z-1 -mt-18" />

            <div class="text-center">
              <h1 class="text-2xl font-semibold text-highlighted">
                Welcome to Volta
              </h1>
              <p class="text-base text-muted mt-1">
                Ask anything or tell Volta what you need
              </p>
            </div>
          </div>

          <div class="w-full max-w-xl flex flex-col gap-6">
            <ChatPrompt
              v-model="input"
              :status="chat.status"
              :selected-model="selectedModel"
              :disabled="!input.trim()"
              class="[view-transition-name:chat-prompt] p-2"
              @submit="onSubmit"
              @stop="chat.stop()"
              @reload="chat.regenerate()"
              @update:selected-model="onModelChange"
            />

            <ChatSuggestions @ask="askQuestion" />
          </div>
        </div>

        <!-- Active chat -->
        <UContainer v-else class="max-w-3xl flex-1 flex flex-col gap-4 sm:gap-6">
          <UTheme
            :ui="{
              prose: {
                p: { base: 'my-4 leading-6' },
                ul: { base: 'my-4' },
                ol: { base: 'my-4' },
                li: { base: 'leading-6' },
                h1: { base: 'text-xl mb-4' },
                h2: { base: 'text-lg mt-6 mb-3' },
                h3: { base: 'text-base mt-4 mb-2' },
                h4: { base: 'text-sm mt-3 mb-1.5' },
                code: { base: 'text-xs' },
                pre: { base: 'text-xs/5' },
                table: { root: 'my-4' },
                hr: { base: 'my-4' }
              }
            }"
          >
            <UChatMessages
              :messages="chat.messages"
              :status="chat.status"
              should-auto-scroll
              :spacing-offset="160"
              class="pt-(--ui-header-height) pb-4 sm:pb-6 px-2"
            >
              <template #indicator>
                <UChatTool icon="i-lucide-brain" text="Thinking..." streaming />
              </template>

              <template #content="{ message }">
                <template v-for="(part, index) in message.parts" :key="`${message.id}-${part.type}-${index}`">
                  <UChatReasoning
                    v-if="isReasoningUIPart(part)"
                    :text="part.text"
                    :streaming="isPartStreaming(part)"
                    icon="i-lucide-brain"
                  >
                    <ChatComark
                      :markdown="part.text"
                      :streaming="isPartStreaming(part)"
                    />
                  </UChatReasoning>

                  <template v-else-if="isTextUIPart(part)">
                    <ChatComark
                      v-if="message.role === 'assistant'"
                      :markdown="part.text"
                      :streaming="isPartStreaming(part)"
                    />
                    <p v-else-if="message.role === 'user'" class="whitespace-pre-wrap text-sm/6">
                      {{ part.text }}
                    </p>
                  </template>

                  <template v-else-if="isToolUIPart(part) && getToolName(part as any) === 'generateChart'">
                    <UChatTool
                      v-if="isToolStreaming(part)"
                      :text="getToolText(part)"
                      :icon="getToolIcon(part)"
                      :streaming="isToolStreaming(part)"
                    />
                    <ChatChart v-else-if="(part as any).output" :result="(part as any).output" />
                  </template>

                  <UChatTool
                    v-else-if="isToolUIPart(part)"
                    :text="getToolText(part)"
                    :icon="getToolIcon(part)"
                    :streaming="isToolStreaming(part)"
                  />
                </template>
              </template>
            </UChatMessages>

            <ChatPrompt
              v-model="input"
              :status="chat.status"
              :error="chat.error"
              :selected-model="selectedModel"
              :disabled="!input.trim()"
              class="sticky bottom-0 [view-transition-name:chat-prompt] rounded-b-none z-10 p-2"
              @submit="onSubmit"
              @stop="chat.stop()"
              @reload="chat.regenerate()"
              @update:selected-model="onModelChange"
            />
          </UTheme>
        </UContainer>
      </template>
    </template>
  </UDashboardPanel>
</template>
