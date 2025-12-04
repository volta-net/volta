import type { Repository } from './repository'

export interface Installation {
  id: number
  account: {
    login: string | undefined
    avatar: string | undefined
    type: string | undefined
  }
  repositories: Repository[]
}
