import { and, eq, inArray, sql, gte } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'

interface WeeklyStats {
  week: string
  open: number
  closed: number
}

/**
 * Get issue statistics over time for the user's favorite repositories
 * Returns weekly counts of open and closed issues
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const query = getQuery(event)

  // Number of weeks to look back (default 12 weeks)
  const weeks = Math.min(parseInt(query.weeks as string, 10) || 12, 52)

  const favoriteRepoIdsSubquery = getUserFavoriteRepoIdsSubquery(user.id)

  // Calculate the start date (X weeks ago)
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - weeks * 7)

  // Get issues created in the time period from favorite repos (excluding PRs)
  const issues = await db
    .select({
      state: schema.issues.state,
      createdAt: schema.issues.createdAt,
      closedAt: schema.issues.closedAt
    })
    .from(schema.issues)
    .where(and(
      inArray(schema.issues.repositoryId, favoriteRepoIdsSubquery),
      eq(schema.issues.pullRequest, false),
      gte(schema.issues.createdAt, startDate)
    ))

  // Group by week
  const weeklyData = new Map<string, { open: number, closed: number }>()

  // Initialize all weeks with zeros
  for (let i = 0; i < weeks; i++) {
    const weekStart = new Date()
    weekStart.setDate(weekStart.getDate() - (weeks - 1 - i) * 7)
    const weekKey = getWeekKey(weekStart)
    weeklyData.set(weekKey, { open: 0, closed: 0 })
  }

  // Count issues per week
  for (const issue of issues) {
    const createdWeek = getWeekKey(new Date(issue.createdAt))

    if (weeklyData.has(createdWeek)) {
      const data = weeklyData.get(createdWeek)!
      if (issue.state === 'open') {
        data.open++
      } else {
        data.closed++
      }
    }
  }

  // Convert to array format for the chart
  const stats: WeeklyStats[] = Array.from(weeklyData.entries())
    .map(([week, counts]) => ({
      week,
      open: counts.open,
      closed: counts.closed
    }))
    .sort((a, b) => a.week.localeCompare(b.week))

  // Also get totals
  const totals = await db
    .select({
      state: schema.issues.state,
      count: sql<number>`count(*)`
    })
    .from(schema.issues)
    .where(and(
      inArray(schema.issues.repositoryId, favoriteRepoIdsSubquery),
      eq(schema.issues.pullRequest, false)
    ))
    .groupBy(schema.issues.state)

  const totalOpen = totals.find(t => t.state === 'open')?.count ?? 0
  const totalClosed = totals.find(t => t.state === 'closed')?.count ?? 0

  // Get resolution status breakdown for open issues
  const resolutionStats = await db
    .select({
      status: schema.issues.resolutionStatus,
      count: sql<number>`count(*)`
    })
    .from(schema.issues)
    .where(and(
      inArray(schema.issues.repositoryId, favoriteRepoIdsSubquery),
      eq(schema.issues.pullRequest, false),
      eq(schema.issues.state, 'open')
    ))
    .groupBy(schema.issues.resolutionStatus)

  const resolutionBreakdown = {
    answered: 0,
    likely_resolved: 0,
    waiting_on_author: 0,
    needs_attention: 0,
    unanalyzed: 0
  }

  for (const stat of resolutionStats) {
    if (stat.status && stat.status in resolutionBreakdown) {
      resolutionBreakdown[stat.status as keyof typeof resolutionBreakdown] = stat.count
    } else {
      resolutionBreakdown.unanalyzed += stat.count
    }
  }

  return {
    weekly: stats,
    totals: {
      open: totalOpen,
      closed: totalClosed
    },
    resolution: resolutionBreakdown
  }
})

/**
 * Get a week key in format YYYY-WW for grouping
 */
function getWeekKey(date: Date): string {
  const year = date.getFullYear()
  const startOfYear = new Date(year, 0, 1)
  const days = Math.floor((date.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000))
  const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7)
  return `${year}-W${weekNumber.toString().padStart(2, '0')}`
}
