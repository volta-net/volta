// https://docs.github.com/en/rest/activity/notifications?apiVersion=2022-11-28
export interface Notification {
  id: string
  unread: boolean
  reason: 'approval_requested' | 'assign' | 'author' | 'ci_activity' | 'comment' | 'invitation' | 'manual' | 'member_feature_requested' | 'mention' | 'milestone' | 'pull_request_review' | 'pull_request_review_comment' | 'review_requested' | 'security_advisory_credit' | 'security_alert' | 'state_change' | 'subscribed' | 'team_mention'
  updatedAt: string
  lastReadAt: string | null
  subject: {
    title: string
    url: string
    type: 'Issue' | 'PullRequest' | 'Release' | 'Commit'
  }
  repository: {
    owner: string
    name: string
    avatar: string
  }
}
