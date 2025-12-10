import type { DBInstallation } from './db'
import type { Repository, RepositorySubscription } from './repository'

export interface InstallationRepository extends Repository {
  subscription?: RepositorySubscription
}

export interface Installation extends Pick<DBInstallation, 'id'> {
  account: {
    login: string | undefined
    avatar: string | undefined
    type: string | undefined
  }
  repositories: InstallationRepository[]
}
