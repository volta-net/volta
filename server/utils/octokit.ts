import { Octokit } from 'octokit'
import { createAppAuth } from '@octokit/auth-app'

let _octokit: Octokit | null = null

export function useOctokit() {
  if (_octokit) {
    return _octokit
  }

  const config = useRuntimeConfig()

  _octokit = new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: config.github.appId,
      privateKey: config.github.privateKey,
      clientId: config.oauth.github.clientId,
      clientSecret: config.oauth.github.clientSecret
    }
  })

  return _octokit
}

export async function useOctokitAsInstallation(installationId: number) {
  const octokit = useOctokit()

  return octokit.auth({
    type: 'installation',
    installationId
  }) as Promise<{ token: string }>
}

export function useOctokitWithToken(token: string) {
  return new Octokit({
    auth: token
  })
}
