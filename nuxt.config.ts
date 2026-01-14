// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@nuxtjs/mdc',
    '@nuxthub/core',
    'nuxt-auth-utils',
    '@vueuse/nuxt'
    // 'workflow/nuxt'
  ],

  ssr: false,

  devtools: {
    enabled: true
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

  compatibilityDate: '2025-01-15',

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
