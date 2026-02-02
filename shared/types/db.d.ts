import type {
  users,
  notifications,
  installations,
  repositories,
  releases,
  workflowRuns,
  labels,
  milestones,
  types,
  issues,
  issueAssignees,
  issueLabels,
  issueRequestedReviewers,
  issueComments,
  issueReviews,
  issueReviewComments,
  repositorySubscriptions,
  issueSubscriptions,
  favoriteRepositories,
  favoriteIssues,
  NotificationType,
  NotificationAction,
  ReviewState
} from '@nuxthub/db/schema'

/**
 * Utility type to convert Date to string (for JSON serialized API responses)
 */
export type Serialized<T> = {
  [K in keyof T]: T[K] extends Date
    ? string
    : T[K] extends Date | null
      ? string | null
      : T[K] extends object
        ? Serialized<T[K]>
        : T[K]
}

// Base types inferred from Drizzle schema
export type DBUser = typeof users.$inferSelect
export type DBNotification = typeof notifications.$inferSelect
export type DBInstallation = typeof installations.$inferSelect
export type DBRepository = typeof repositories.$inferSelect
export type DBRelease = typeof releases.$inferSelect
export type DBWorkflowRun = typeof workflowRuns.$inferSelect
export type DBLabel = typeof labels.$inferSelect
export type DBMilestone = typeof milestones.$inferSelect
export type DBType = typeof types.$inferSelect
export type DBIssue = typeof issues.$inferSelect
export type DBIssueAssignee = typeof issueAssignees.$inferSelect
export type DBIssueLabel = typeof issueLabels.$inferSelect
export type DBIssueRequestedReviewer = typeof issueRequestedReviewers.$inferSelect
export type DBIssueComment = typeof issueComments.$inferSelect
export type DBIssueReview = typeof issueReviews.$inferSelect
export type DBIssueReviewComment = typeof issueReviewComments.$inferSelect
export type DBRepositorySubscription = typeof repositorySubscriptions.$inferSelect
export type DBIssueSubscription = typeof issueSubscriptions.$inferSelect
export type DBFavoriteRepository = typeof favoriteRepositories.$inferSelect
export type DBFavoriteIssue = typeof favoriteIssues.$inferSelect

// Re-export schema types (WorkflowConclusion exported from index.d.ts)
export type {
  NotificationType,
  NotificationAction,
  ReviewState
}
