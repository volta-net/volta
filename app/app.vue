<script setup lang="ts">
import colors from 'tailwindcss/colors'

const { user } = useUserSession()

const colorMode = useColorMode()
const appConfig = useAppConfig()

const color = computed(() => colorMode.value === 'dark' ? (colors as any)[appConfig.ui.colors.neutral][900] : 'white')

useHead({
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    { key: 'theme-color', name: 'theme-color', content: color }
  ],
  link: [
    { rel: 'icon', href: '/favicon.ico' }
  ],
  htmlAttrs: {
    lang: 'en'
  }
})

const title = 'Volta'
const description = 'A better GitHub inbox for busy maintainers.'

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description,
  twitterCard: 'summary_large_image'
})
</script>

<template>
  <UApp :toaster="{ expand: false }">
    <NuxtLoadingIndicator color="var(--ui-primary)" :height="2" />

    <NuxtLayout v-if="user">
      <NuxtPage />
    </NuxtLayout>

    <div v-else class="flex flex-col h-screen">
      <div class="flex-1 flex flex-col items-center justify-center gap-8 rounded-md ring ring-default bg-default/75 shadow m-4">
        <AppLogo class="mx-auto h-12 text-highlighted" />

        <h1 class="text-lg font-medium text-toned">
          {{ description }}
        </h1>

        <UButton
          label="Continue with GitHub"
          icon="i-simple-icons-github"
          to="/auth/github"
          external
          color="neutral"
          size="lg"
        />
      </div>
    </div>
  </UApp>
</template>
