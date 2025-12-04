import { eq } from 'drizzle-orm'
import { db, schema } from 'hub:db'

export default defineNitroPlugin(() => {
  // Called when the session is fetched during SSR for the Vue composable (/api/_auth/session)
  // Or when we call useUserSession().fetch()
  sessionHooks.hook('fetch', async (session, event) => {
    if (!session.user?.id) {
      throw createError({ statusCode: 401, message: 'Invalid session' })
    }

    // Verify user exists in database and is registered
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, session.user.id))

    if (!user) {
      throw createError({ statusCode: 401, message: 'User not found' })
    }

    if (!user.registered) {
      throw createError({ statusCode: 401, message: 'User not registered' })
    }

    // Optionally extend session with fresh data from DB
    session.user.username = user.login
    session.user.avatar = user.avatarUrl || session.user.avatar
  })

  // Called when we call useUserSession().clear() or clearUserSession(event)
  sessionHooks.hook('clear', async (session, event) => {
    console.log(`[session] User ${session.user?.username} logged out`)
  })
})
