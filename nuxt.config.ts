// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@nuxtjs/mdc',
    '@nuxthub/core',
    '@vueuse/nuxt',
    'nuxt-auth-utils',
    'workflow/nuxt',
    '@hannoeru/nuxt-otel'
  ],

  ssr: false,

  devtools: {
    enabled: true
  },

  app: {
    head: {
      title: 'Volta',
      meta: [
        { key: 'theme-color', name: 'theme-color', content: '#0b0809' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
        { name: 'apple-mobile-web-app-title', content: 'Volta' }
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/logo-dark.svg' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' }
      ],
      htmlAttrs: {
        lang: 'en'
      }
    }
  },

  css: ['~/assets/css/main.css'],

  mdc: {
    highlight: {
      langs: ['bash', 'html', 'ts', 'typescript', 'diff', 'vue', 'json', 'yml', 'css', 'mdc', 'blade', 'edge']
    }
  },

  ui: {
    theme: {
      colors: [
        'primary',
        'info',
        'success',
        'warning',
        'error',
        'important'
      ],
      defaultVariants: {
        color: 'neutral',
        size: 'sm'
      }
    },
    experimental: {
      componentDetection: true
    }
  },

  runtimeConfig: {
    github: {
      appId: '',
      privateKey: '',
      webhookSecret: ''
    },
    public: {
      github: {
        appSlug: ''
      }
    }
  },

  routeRules: {
    '/': { prerender: true, redirect: '/inbox' }
  },
  experimental: {
    asyncContext: true
  },

  compatibilityDate: '2026-01-15',

  hub: {
    db: 'postgresql'
  },

  vite: {
    optimizeDeps: {
      include: [
        '@nuxt/ui > prosemirror-gapcursor',
        '@nuxt/ui > prosemirror-state',
        '@nuxt/ui > prosemirror-tables'
      ]
    }
  },

  auth: {
    loadStrategy: 'client-only'
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  },

  icon: {
    clientBundle: {
      scan: {
        globInclude: [
          '{app,shared}/**',
          '.nuxt/**'
        ],
        globExclude: ['node_modules']
      }
    },
    provider: 'none'
  }
})
