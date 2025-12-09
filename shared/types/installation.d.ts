import type { Repository, RepositorySubscription } from './repository'

export interface InstallationRepository extends Repository {
  subscription?: RepositorySubscription
}

export interface Installation {
  id: number
  account: {
    login: string | undefined
    avatar: string | undefined
    type: string | undefined
  }
  repositories: InstallationRepository[]
}
