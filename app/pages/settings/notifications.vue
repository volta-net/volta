<script setup lang="ts">
const toast = useToast()

// Fetch current settings
const { data: settings, refresh } = await useFetch('/api/settings')

interface BotItem {
  label: string
  value: string
  avatar: { src: string, alt: string }
}

// GitHub App avatar URLs (from https://api.github.com/users/{login}%5Bbot%5D)
const botAvatars: Record<string, string> = {
  'vercel[bot]': 'https://avatars.githubusercontent.com/in/8329?v=4',
  'coderabbitai[bot]': 'https://avatars.githubusercontent.com/in/347564?v=4',
  'github-actions[bot]': 'https://avatars.githubusercontent.com/in/15368?v=4',
  'pkg-pr-new[bot]': 'https://avatars.githubusercontent.com/in/882742?v=4',
  'renovate[bot]': 'https://avatars.githubusercontent.com/in/2740?v=4',
  'dependabot[bot]': 'https://avatars.githubusercontent.com/in/29110?v=4',
  'netlify[bot]': 'https://avatars.githubusercontent.com/in/13473?v=4',
  'codecov[bot]': 'https://avatars.githubusercontent.com/in/254?v=4'
}

function toBotItem(login: string): BotItem {
  const src = botAvatars[login] || `https://github.com/${login.replace('[bot]', '')}.png`
  return {
    label: login,
    value: login,
    avatar: { src, alt: login }
  }
}

// Pre-defined bot options
const botItems = ref<BotItem[]>(Object.keys(botAvatars).map(toBotItem))

// Form state
const excludedBots = ref<string[]>([])
const saving = ref(false)

// Initialize from settings (also ensure saved custom bots appear in the items list)
watch(() => settings.value?.excludedBots, (bots) => {
  excludedBots.value = bots ?? []

  const knownValues = new Set(botItems.value.map(b => b.value))
  for (const bot of bots ?? []) {
    if (!knownValues.has(bot)) {
      botItems.value.push(toBotItem(bot))
    }
  }
}, { immediate: true })

// Track if value has changed
const hasChanges = computed(() => {
  const current = [...excludedBots.value].sort()
  const saved = [...(settings.value?.excludedBots ?? [])].sort()
  return JSON.stringify(current) !== JSON.stringify(saved)
})

function onCreate(item: string) {
  botItems.value.push(toBotItem(item))
  excludedBots.value = [...excludedBots.value, item]
}

async function save() {
  saving.value = true

  try {
    await $fetch('/api/settings', {
      method: 'PATCH',
      body: {
        excludedBots: excludedBots.value
      }
    })

    await refresh()

    toast.add({
      title: 'Settings saved',
      description: 'Your notification preferences have been updated.',
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
      title="Notifications"
      description="Configure which notifications you want to receive."
      variant="naked"
      orientation="horizontal"
      class="mb-4"
      :ui="{ title: 'leading-7', container: 'flex! flex-row! gap-0! items-start!' }"
    />

    <UCard class="overflow-y-auto" :ui="{ header: 'sm:px-4', body: 'sm:p-4', footer: 'p-0!' }">
      <template #default>
        <UFormField
          label="Excluded bots"
          description="Notifications from these bots will be silenced. You can also add custom bot names."
          size="md"
          class="mb-4"
        >
          <UInputMenu
            v-model="excludedBots"
            :items="botItems"
            value-key="value"
            multiple
            create-item
            placeholder="Search or add a bot..."
            icon="i-lucide-bot"
            size="md"
            variant="soft"
            class="w-full data-[state=open]:bg-elevated"
            :ui="{
              content: 'max-h-92',
              trailing: 'group',
              trailingIcon: 'group-data-[state=open]:rotate-180 transition-transform duration-200'
            }"
            open-on-click
            @create="onCreate"
          />
        </UFormField>

        <div class="flex items-center justify-end gap-2">
          <UButton
            label="Save"
            :loading="saving"
            :variant="hasChanges ? 'solid' : 'soft'"
            :disabled="!hasChanges"
            @click="save"
          />
        </div>
      </template>

      <template #footer>
        <UAlert
          icon="i-lucide-info"
          color="primary"
          variant="soft"
          description="When a bot is excluded, you will no longer receive notifications for actions performed by that bot across all your repositories."
          :ui="{ icon: 'size-4 mt-0.5' }"
          class="rounded-none"
        />
      </template>
    </UCard>
  </div>
</template>
