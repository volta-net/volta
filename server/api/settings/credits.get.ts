import { getUserAiSettings } from '~~/server/utils/ai'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  const { token } = await getUserAiSettings(user.id)

  if (!token) {
    throw createError({
      statusCode: 400,
      message: 'No AI Gateway token configured'
    })
  }

  try {
    const response = await $fetch<{ balance: string, total_used: string }>('https://ai-gateway.vercel.sh/v1/credits', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })

    return {
      balance: response.balance,
      totalUsed: response.total_used
    }
  } catch (error: any) {
    // Handle invalid token or API errors
    if (error.status === 401 || error.statusCode === 401) {
      throw createError({
        statusCode: 401,
        message: 'Invalid AI Gateway token'
      })
    }

    throw createError({
      statusCode: 500,
      message: 'Failed to fetch credits from Vercel AI Gateway'
    })
  }
})
