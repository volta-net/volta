// shared/types/auth.d.ts
declare module '#auth-utils' {
  interface User {
    username: string
    avatar: string
    accessToken: string
  }

  interface SecureSessionData {
    accessToken: string
  }
}

export {}
