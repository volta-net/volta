export default defineOAuthGitHubEventHandler({
  config: {
    scope: ['notifications']
  },
  async onSuccess(event, { user, tokens}) {
    await setUserSession(event, {
      user: {
        username: user.login,
        avatar: user.avatar_url,
        accessToken: tokens.access_token,
      },
      secure: {
        accessToken: tokens.access_token,
      }
    })

    return sendRedirect(event, '/')
  },
})
