<script setup lang="ts">
const toast = useToast()

// Fetch current settings
const { data: settings, refresh } = await useFetch('/api/settings')

// Form state
const token = ref('')
const saving = ref(false)
const showToken = ref(false)

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
</script>

<template>
  <div class="flex flex-col flex-1 min-h-0">
    <UPageCard
      title="AI Gateway"
      description="Configure your Vercel AI Gateway token to enable AI-powered features like issue resolution analysis and comment suggestions."
      variant="naked"
      orientation="horizontal"
      class="mb-4"
      :ui="{ title: 'leading-7', container: 'flex! flex-row! gap-0! items-start!' }"
    />

    <UCard :ui="{ header: 'sm:px-4', body: 'sm:p-4', footer: 'p-0!' }">
      <template #header>
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
      </template>

      <template #default>
        <UFormField label="Vercel AI Gateway Token" size="md" class="mb-4">
          <template #hint>
            <ULink
              to="https://vercel.com/d?to=/%5Bteam%5D/~/ai-gateway/api-keys&title=AI+Gateway+API+Keys"
              target="_blank"
              class="text-primary font-medium"
            >
              Get a token
            </ULink>
          </template>

          <UInput
            v-model="token"
            :type="showToken ? 'text' : 'password'"
            :placeholder="hasToken ? '••••••••••••••••' : 'Enter your Vercel AI Gateway token'"
            class="w-full"
          >
            <template #trailing>
              <UButton
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

        <!-- Actions -->
        <div class="flex items-center justify-end gap-2">
          <UButton
            :label="hasToken ? 'Update token' : 'Save token'"
            :loading="saving"
            :disabled="!token"
            @click="saveToken"
          />

          <UButton
            v-if="hasToken"
            label="Remove token"
            variant="soft"
            color="error"
            :loading="saving"
            @click="removeToken"
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
