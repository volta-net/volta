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
    '@vite-pwa/nuxt'
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
    savoir: {
      apiUrl: '',
      apiKey: ''
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

  compatibilityDate: '2026-01-15',

  hub: {
    db: {
      dialect: 'postgresql',
      replicas: [
        process.env.DATABASE_URL_REPLICA as string
      ].filter(Boolean)
    }
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
  },

  pwa: {
    manifest: {
      name: 'Volta',
      short_name: 'Volta',
      description: 'GitHub Issue Management',
      theme_color: '#0b0809',
      background_color: '#0b0809',
      display: 'standalone',
      icons: [
        {
          src: '/logo.png',
          sizes: '512x512',
          type: 'image/png'
        },
        {
          src: '/apple-touch-icon.png',
          sizes: '180x180',
          type: 'image/png'
        }
      ]
    },
    client: {
      installPrompt: true,
      periodicSyncForUpdates: 1000 * 60 * 10 // 10 minutes
    }
  }
})
