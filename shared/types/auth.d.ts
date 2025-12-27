// shared/types/auth.d.ts
declare module '#auth-utils' {
  interface User {
    id: number // Internal database ID
    githubId: number // GitHub user ID (for API calls)
    username: string
    avatar: string
    registered: boolean
  }

  interface SecureSessionData {
    accessToken: string
    refreshToken?: string
    expiresAt?: number
  }
}

export {}
