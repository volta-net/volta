// shared/types/auth.d.ts
declare module '#auth-utils' {
  interface User {
    id: number
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
