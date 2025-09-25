export default RStoreSchema.withItemType<Notification>().defineCollection({
  name: 'notifications',
  // Interact with a REST/GraphQL/etc. API
  hooks: {
    fetchFirst: ({ key }) => { /* ... */ },
    async fetchMany ({ params }) {
      console.log('fetchMany notifications')
      const octokit = useOctokit()
      const { data: notifications } = await octokit.request('GET /notifications', {
        all: true
      })

      return notifications.map((notification) => ({
        id: notification.id,
        unread: notification.unread,
        reason: notification.reason,
        updatedAt: notification.updated_at,
        lastReadAt: notification.last_read_at,
        subject: notification.subject,
        repository: {
          owner: notification.repository.owner.login,
          name: notification.repository.name,
          avatar: notification.repository.owner.avatar_url
        }
      }))
    },
    create: ({ item }) => { /* ... */ },
    update: ({ key, item }) => { /* ... */ },
    delete: ({ key }) => { /* ... */ },
  },
})
