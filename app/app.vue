<script setup lang="ts">
import { Analytics } from '@vercel/analytics/nuxt'

const { user } = useUserSession()
const colorMode = useColorMode()
const colorScheme = usePreferredColorScheme()

const color = computed(() => colorMode.value === 'dark' ? '#0b0809' : '#fafafa')
const href = computed(() => colorScheme.value === 'dark' ? '/logo-dark.svg' : '/logo-light.svg')

useHead({
  meta: [
    { key: 'theme-color', name: 'theme-color', content: color }
  ],
  link: [
    { rel: 'icon', type: 'image/svg+xml', href }
  ]
})

const title = 'Volta'
const description = 'The AI-powered GitHub inbox for open-source maintainers.'

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description,
  twitterCard: 'summary_large_image'
})

// PWA update toast
const { $pwa } = useNuxtApp()
const toast = useToast()

watch(() => $pwa?.needRefresh, (needRefresh) => {
  if (!needRefresh) return

  toast.add({
    id: 'pwa-update',
    title: 'Update available',
    description: 'A new version is ready to install.',
    icon: 'i-lucide-download',
    duration: 0,
    close: false,
    actions: [{
      label: 'Update',
      onClick: () => $pwa?.updateServiceWorker()
    }]
  })
})
</script>

<template>
  <NuxtPwaManifest />

  <UApp :toaster="{ expand: false }">
    <NuxtLoadingIndicator color="var(--ui-primary)" :height="2" />

    <NuxtLayout v-if="user">
      <NuxtPage />
    </NuxtLayout>

    <div v-else class="flex flex-col h-screen">
      <div class="flex-1 flex flex-col items-center justify-center gap-8 rounded-lg ring ring-default bg-default/75 shadow m-4">
        <AppLogo class="mx-auto h-12 text-highlighted" />

        <h1 class="text-lg text-center font-medium text-toned">
          {{ description }}
        </h1>

        <UButton
          label="Continue with GitHub"
          icon="i-simple-icons-github"
          to="/auth/github"
          external
          size="lg"
        />
      </div>
    </div>

    <Analytics />
  </UApp>
</template>
