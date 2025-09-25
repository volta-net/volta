<script setup lang="ts">
const { user } = useUserSession()

useHead({
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1' }
  ],
  link: [
    { rel: 'icon', href: '/favicon.ico' }
  ],
  htmlAttrs: {
    lang: 'en'
  }
})

const title = 'Nuxt Starter Template'
const description = 'A production-ready starter template powered by Nuxt UI. Build beautiful, accessible, and performant applications in minutes, not hours.'

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description,
  ogImage: 'https://ui.nuxt.com/assets/templates/nuxt/starter-light.png',
  twitterImage: 'https://ui.nuxt.com/assets/templates/nuxt/starter-light.png',
  twitterCard: 'summary_large_image'
})
</script>

<template>
  <UApp>
    <NuxtLayout v-if="user">
      <NuxtPage />
    </NuxtLayout>
    <div v-else class="flex flex-col items-center justify-center h-screen gap-6">
      <AppLogo class="mx-auto h-12 text-highlighted" />
      <h1 class="text-xl font-semibold text-toned">
        A better GitHub inbox for busy maintainers.
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
  </UApp>
</template>
