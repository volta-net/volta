import { Octokit } from 'octokit'

function useOctokit() {
  const { user } = useUserSession()
  if (!user.value) {
    throw new Error('User not connected')
  }

  return new Octokit({
    auth: user.value.accessToken
  })
}

export default createSharedComposable(useOctokit)
