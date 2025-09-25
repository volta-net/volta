export type GitHubNotification = {
  id: string
  unread: boolean
  reason: 'assign' | 'author' | 'comment' | 'ci_activity' | 'invitation' | 'manual' | 'mention' | 'review_requested' | 'security_alert' | 'state_change' | 'subscribed' | 'team_mention'
  updatedAt: string
  lastReadAt: string | null
  subject: {
    title: string
    url: string
    latest_comment_url: string
    type: 'Issue' | 'PullRequest' | 'Release' | 'Commit'
  }
  repository: {
    owner: string
    name: string
    avatar: string
  }
}
