export default defineEventHandler(async (event) => {
  const { user, secure } = await requireUserSession(event)

  const data = await $fetch<any[]>('https://api.github.com/notifications', {
    query: {
      all: 'true'
    },
    headers: {
      Authorization: `Bearer ${secure!.accessToken}`,
    },
  })

  const notifications = data.map((notification: any) => ({
    id: notification.id,
    unread: notification.unread,
    reason: notification.reason,
    updatedAt: notification.updated_at,
    lastReadAt: notification.last_read_at,
    subject: notification.subject,
    repository: {
      owner: notification.repository.owner.login,
      name: notification.repository.name,
      avatar: notification.repository.owner.avatar_url,
    }
  }))


  return notifications
})
