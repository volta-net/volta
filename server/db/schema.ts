import { pgTable, text, timestamp, bigint, boolean, serial } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

// Users (GitHub users - both registered and shadow users from imports)
export const users = pgTable('users', {
  id: bigint({ mode: 'number' }).primaryKey(), // GitHub user ID
  login: text().notNull(),
  name: text(),
  email: text(),
  avatarUrl: text('avatar_url'),
  // True if user has logged into the app, false for shadow users from imports
  registered: boolean().default(false).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
})

// Notification types (what entity the notification is about)
export type NotificationType = 'issue' | 'pull_request' | 'release' | 'workflow_run'

// Notification actions (what happened)
export type NotificationAction
  = | 'opened' | 'reopened' | 'closed' | 'merged'
    | 'assigned' | 'mentioned' | 'comment'
    | 'review_requested' | 'review_submitted' | 'review_dismissed'
    | 'ready_for_review' // draft PR marked ready
    | 'published' // releases
    | 'failed' | 'success' // workflow runs

// Notifications
export const notifications = pgTable('notifications', {
  id: serial().primaryKey(),
  // Who this notification is for
  userId: bigint('user_id', { mode: 'number' }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  // Notification content
  type: text().$type<NotificationType>().notNull(),
  action: text().$type<NotificationAction>().notNull(),
  body: text(), // Optional extra context (e.g., comment body)
  // Relations (populated via Drizzle)
  repositoryId: bigint('repository_id', { mode: 'number' }).references(() => repositories.id, { onDelete: 'cascade' }),
  issueId: bigint('issue_id', { mode: 'number' }).references(() => issues.id, { onDelete: 'cascade' }),
  releaseId: bigint('release_id', { mode: 'number' }).references(() => releases.id, { onDelete: 'cascade' }),
  workflowRunId: bigint('workflow_run_id', { mode: 'number' }).references(() => workflowRuns.id, { onDelete: 'cascade' }),
  // Actor (who triggered the notification)
  actorId: bigint('actor_id', { mode: 'number' }).references(() => users.id, { onDelete: 'set null' }),
  // Status
  read: boolean().default(false),
  readAt: timestamp('read_at'),
  createdAt: timestamp('created_at').notNull().defaultNow()
})

// GitHub App Installations
export const installations = pgTable('installations', {
  id: bigint({ mode: 'number' }).primaryKey(), // GitHub installation ID
  accountLogin: text('account_login').notNull(),
  accountId: bigint('account_id', { mode: 'number' }).notNull(),
  accountType: text('account_type').notNull(), // 'User' | 'Organization'
  avatarUrl: text('avatar_url'),
  suspended: boolean().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
})

// Repositories (matches GitHub API)
export const repositories = pgTable('repositories', {
  id: bigint({ mode: 'number' }).primaryKey(), // GitHub repo ID
  installationId: bigint('installation_id', { mode: 'number' }).notNull().references(() => installations.id, { onDelete: 'cascade' }),
  name: text().notNull(),
  fullName: text('full_name').notNull(),
  private: boolean().default(false),
  description: text(),
  htmlUrl: text('html_url'),
  defaultBranch: text('default_branch'),
  archived: boolean().default(false),
  disabled: boolean().default(false),
  // Volta-specific
  syncEnabled: boolean('sync_enabled').default(true),
  lastSyncedAt: timestamp('last_synced_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
})

// Releases (matches GitHub API)
export const releases = pgTable('releases', {
  id: bigint({ mode: 'number' }).primaryKey(), // GitHub release ID
  repositoryId: bigint('repository_id', { mode: 'number' }).notNull().references(() => repositories.id, { onDelete: 'cascade' }),
  authorId: bigint('author_id', { mode: 'number' }).references(() => users.id, { onDelete: 'set null' }),
  tagName: text('tag_name').notNull(),
  name: text(),
  body: text(),
  draft: boolean().default(false),
  prerelease: boolean().default(false),
  htmlUrl: text('html_url'),
  publishedAt: timestamp('published_at'),
  createdAt: timestamp('created_at').notNull().defaultNow()
})

// Workflow run conclusions
export type WorkflowConclusion = 'success' | 'failure' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required' | 'stale' | 'neutral' | 'startup_failure'

// Workflow Runs (GitHub Actions)
export const workflowRuns = pgTable('workflow_runs', {
  id: bigint({ mode: 'number' }).primaryKey(), // GitHub workflow run ID
  repositoryId: bigint('repository_id', { mode: 'number' }).notNull().references(() => repositories.id, { onDelete: 'cascade' }),
  actorId: bigint('actor_id', { mode: 'number' }).references(() => users.id, { onDelete: 'set null' }),
  workflowId: bigint('workflow_id', { mode: 'number' }).notNull(),
  workflowName: text('workflow_name'),
  name: text(), // Run name (e.g., "CI" or "Build and Test")
  headBranch: text('head_branch'),
  headSha: text('head_sha'),
  event: text(), // push, pull_request, etc.
  status: text(), // queued, in_progress, completed
  conclusion: text().$type<WorkflowConclusion>(), // success, failure, etc.
  htmlUrl: text('html_url'),
  runNumber: bigint('run_number', { mode: 'number' }),
  runAttempt: bigint('run_attempt', { mode: 'number' }),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
})

// Labels (matches GitHub API)
export const labels = pgTable('labels', {
  id: bigint({ mode: 'number' }).primaryKey(), // GitHub label ID
  repositoryId: bigint('repository_id', { mode: 'number' }).notNull().references(() => repositories.id, { onDelete: 'cascade' }),
  name: text().notNull(),
  color: text().notNull(),
  description: text(),
  default: boolean().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
})

// Milestones (matches GitHub API)
export const milestones = pgTable('milestones', {
  id: bigint({ mode: 'number' }).primaryKey(), // GitHub milestone ID
  repositoryId: bigint('repository_id', { mode: 'number' }).notNull().references(() => repositories.id, { onDelete: 'cascade' }),
  number: bigint({ mode: 'number' }).notNull(),
  title: text().notNull(),
  description: text(),
  state: text().notNull(), // 'open' | 'closed'
  htmlUrl: text('html_url'),
  openIssues: bigint('open_issues', { mode: 'number' }).default(0),
  closedIssues: bigint('closed_issues', { mode: 'number' }).default(0),
  dueOn: timestamp('due_on'),
  closedAt: timestamp('closed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
})

// Issue types (includes PRs)
export type IssueType = 'issue' | 'pull_request'

// Issues (Issues & Pull Requests unified)
export const issues = pgTable('issues', {
  id: bigint({ mode: 'number' }).primaryKey(), // GitHub issue/PR ID
  type: text().$type<IssueType>().notNull(), // 'issue' | 'pull_request'
  repositoryId: bigint('repository_id', { mode: 'number' }).notNull().references(() => repositories.id, { onDelete: 'cascade' }),
  milestoneId: bigint('milestone_id', { mode: 'number' }).references(() => milestones.id, { onDelete: 'set null' }),
  // Author (relation to users - shadow user created if needed)
  userId: bigint('user_id', { mode: 'number' }).references(() => users.id, { onDelete: 'set null' }),
  number: bigint({ mode: 'number' }).notNull(),
  title: text().notNull(),
  body: text(),
  state: text().notNull(), // 'open' | 'closed'
  stateReason: text('state_reason'), // 'completed' | 'not_planned' | 'reopened' (issues only)
  htmlUrl: text('html_url'),
  locked: boolean().default(false),
  // PR-specific fields (null for issues)
  draft: boolean().default(false),
  merged: boolean().default(false),
  commits: bigint({ mode: 'number' }).default(0),
  additions: bigint({ mode: 'number' }).default(0),
  deletions: bigint({ mode: 'number' }).default(0),
  changedFiles: bigint('changed_files', { mode: 'number' }).default(0),
  headRef: text('head_ref'),
  headSha: text('head_sha'),
  baseRef: text('base_ref'),
  baseSha: text('base_sha'),
  mergedAt: timestamp('merged_at'),
  // Timestamps
  closedAt: timestamp('closed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  // Sync status - false until full data (comments, reactions, etc.) has been fetched from GitHub
  synced: boolean().default(false).notNull()
})

// Issue Assignees (many-to-many: issues <-> users)
export const issueAssignees = pgTable('issue_assignees', {
  issueId: bigint('issue_id', { mode: 'number' }).notNull().references(() => issues.id, { onDelete: 'cascade' }),
  userId: bigint('user_id', { mode: 'number' }).notNull().references(() => users.id, { onDelete: 'cascade' })
})

// Issue Labels (many-to-many: issues <-> labels)
export const issueLabels = pgTable('issue_labels', {
  issueId: bigint('issue_id', { mode: 'number' }).notNull().references(() => issues.id, { onDelete: 'cascade' }),
  labelId: bigint('label_id', { mode: 'number' }).notNull().references(() => labels.id, { onDelete: 'cascade' })
})

// Issue Requested Reviewers (many-to-many: issues <-> users, for PRs)
export const issueRequestedReviewers = pgTable('issue_requested_reviewers', {
  issueId: bigint('issue_id', { mode: 'number' }).notNull().references(() => issues.id, { onDelete: 'cascade' }),
  userId: bigint('user_id', { mode: 'number' }).notNull().references(() => users.id, { onDelete: 'cascade' })
})

// Issue Comments (general comments on issues/PRs)
export const issueComments = pgTable('issue_comments', {
  id: bigint({ mode: 'number' }).primaryKey(), // GitHub comment ID
  issueId: bigint('issue_id', { mode: 'number' }).notNull().references(() => issues.id, { onDelete: 'cascade' }),
  userId: bigint('user_id', { mode: 'number' }).references(() => users.id, { onDelete: 'set null' }),
  body: text().notNull(),
  htmlUrl: text('html_url'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
})

// Review state
export type ReviewState = 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED' | 'PENDING'

// Issue Reviews (PR review submissions with state)
export const issueReviews = pgTable('issue_reviews', {
  id: bigint({ mode: 'number' }).primaryKey(), // GitHub review ID
  issueId: bigint('issue_id', { mode: 'number' }).notNull().references(() => issues.id, { onDelete: 'cascade' }),
  userId: bigint('user_id', { mode: 'number' }).references(() => users.id, { onDelete: 'set null' }),
  body: text(),
  state: text().$type<ReviewState>().notNull(),
  htmlUrl: text('html_url'),
  commitId: text('commit_id'),
  submittedAt: timestamp('submitted_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
})

// Issue Review Comments (inline code comments on PRs)
export const issueReviewComments = pgTable('issue_review_comments', {
  id: bigint({ mode: 'number' }).primaryKey(), // GitHub comment ID
  issueId: bigint('issue_id', { mode: 'number' }).notNull().references(() => issues.id, { onDelete: 'cascade' }),
  reviewId: bigint('review_id', { mode: 'number' }).references(() => issueReviews.id, { onDelete: 'cascade' }),
  userId: bigint('user_id', { mode: 'number' }).references(() => users.id, { onDelete: 'set null' }),
  body: text().notNull(),
  path: text(), // File path
  line: bigint({ mode: 'number' }), // Line number
  side: text(), // 'LEFT' or 'RIGHT'
  commitId: text('commit_id'),
  diffHunk: text('diff_hunk'),
  htmlUrl: text('html_url'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
})

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  issues: many(issues),
  assignedIssues: many(issueAssignees),
  reviewRequests: many(issueRequestedReviewers),
  comments: many(issueComments),
  reviews: many(issueReviews),
  reviewComments: many(issueReviewComments),
  notifications: many(notifications, { relationName: 'notificationRecipient' }),
  actedNotifications: many(notifications, { relationName: 'notificationActor' }),
  subscriptions: many(repositorySubscriptions),
  issueSubscriptions: many(issueSubscriptions)
}))

export const installationsRelations = relations(installations, ({ many }) => ({
  repositories: many(repositories)
}))

export const repositoriesRelations = relations(repositories, ({ one, many }) => ({
  installation: one(installations, {
    fields: [repositories.installationId],
    references: [installations.id]
  }),
  issues: many(issues),
  labels: many(labels),
  milestones: many(milestones),
  releases: many(releases),
  workflowRuns: many(workflowRuns)
}))

export const releasesRelations = relations(releases, ({ one }) => ({
  repository: one(repositories, {
    fields: [releases.repositoryId],
    references: [repositories.id]
  }),
  author: one(users, {
    fields: [releases.authorId],
    references: [users.id]
  })
}))

export const workflowRunsRelations = relations(workflowRuns, ({ one }) => ({
  repository: one(repositories, {
    fields: [workflowRuns.repositoryId],
    references: [repositories.id]
  }),
  actor: one(users, {
    fields: [workflowRuns.actorId],
    references: [users.id]
  })
}))

export const issuesRelations = relations(issues, ({ one, many }) => ({
  repository: one(repositories, {
    fields: [issues.repositoryId],
    references: [repositories.id]
  }),
  milestone: one(milestones, {
    fields: [issues.milestoneId],
    references: [milestones.id]
  }),
  user: one(users, {
    fields: [issues.userId],
    references: [users.id]
  }),
  assignees: many(issueAssignees),
  labels: many(issueLabels),
  requestedReviewers: many(issueRequestedReviewers),
  comments: many(issueComments),
  reviews: many(issueReviews),
  reviewComments: many(issueReviewComments),
  subscriptions: many(issueSubscriptions)
}))

export const labelsRelations = relations(labels, ({ one, many }) => ({
  repository: one(repositories, {
    fields: [labels.repositoryId],
    references: [repositories.id]
  }),
  issues: many(issueLabels)
}))

export const issueAssigneesRelations = relations(issueAssignees, ({ one }) => ({
  issue: one(issues, {
    fields: [issueAssignees.issueId],
    references: [issues.id]
  }),
  user: one(users, {
    fields: [issueAssignees.userId],
    references: [users.id]
  })
}))

export const issueLabelsRelations = relations(issueLabels, ({ one }) => ({
  issue: one(issues, {
    fields: [issueLabels.issueId],
    references: [issues.id]
  }),
  label: one(labels, {
    fields: [issueLabels.labelId],
    references: [labels.id]
  })
}))

export const issueRequestedReviewersRelations = relations(issueRequestedReviewers, ({ one }) => ({
  issue: one(issues, {
    fields: [issueRequestedReviewers.issueId],
    references: [issues.id]
  }),
  user: one(users, {
    fields: [issueRequestedReviewers.userId],
    references: [users.id]
  })
}))

export const issueCommentsRelations = relations(issueComments, ({ one }) => ({
  issue: one(issues, {
    fields: [issueComments.issueId],
    references: [issues.id]
  }),
  user: one(users, {
    fields: [issueComments.userId],
    references: [users.id]
  })
}))

export const issueReviewsRelations = relations(issueReviews, ({ one, many }) => ({
  issue: one(issues, {
    fields: [issueReviews.issueId],
    references: [issues.id]
  }),
  user: one(users, {
    fields: [issueReviews.userId],
    references: [users.id]
  }),
  comments: many(issueReviewComments)
}))

export const issueReviewCommentsRelations = relations(issueReviewComments, ({ one }) => ({
  issue: one(issues, {
    fields: [issueReviewComments.issueId],
    references: [issues.id]
  }),
  review: one(issueReviews, {
    fields: [issueReviewComments.reviewId],
    references: [issueReviews.id]
  }),
  user: one(users, {
    fields: [issueReviewComments.userId],
    references: [users.id]
  })
}))

export const milestonesRelations = relations(milestones, ({ one, many }) => ({
  repository: one(repositories, {
    fields: [milestones.repositoryId],
    references: [repositories.id]
  }),
  issues: many(issues)
}))

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
    relationName: 'notificationRecipient'
  }),
  repository: one(repositories, {
    fields: [notifications.repositoryId],
    references: [repositories.id]
  }),
  issue: one(issues, {
    fields: [notifications.issueId],
    references: [issues.id]
  }),
  release: one(releases, {
    fields: [notifications.releaseId],
    references: [releases.id]
  }),
  workflowRun: one(workflowRuns, {
    fields: [notifications.workflowRunId],
    references: [workflowRuns.id]
  }),
  actor: one(users, {
    fields: [notifications.actorId],
    references: [users.id],
    relationName: 'notificationActor'
  })
}))

// Repository Subscriptions - Users subscribe to repos for notifications
export const repositorySubscriptions = pgTable('repository_subscriptions', {
  id: serial().primaryKey(),
  userId: bigint('user_id', { mode: 'number' }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  repositoryId: bigint('repository_id', { mode: 'number' }).notNull().references(() => repositories.id, { onDelete: 'cascade' }),
  // Notification preferences (all enabled by default for maintainers)
  issues: boolean().default(true), // New issues
  pullRequests: boolean('pull_requests').default(true), // New PRs
  releases: boolean().default(true), // New releases
  ci: boolean().default(true), // CI failures
  mentions: boolean().default(true), // @mentions
  activity: boolean().default(true), // All activity (comments, reviews, etc.)
  createdAt: timestamp('created_at').notNull().defaultNow()
})

export const repositorySubscriptionsRelations = relations(repositorySubscriptions, ({ one }) => ({
  user: one(users, {
    fields: [repositorySubscriptions.userId],
    references: [users.id]
  }),
  repository: one(repositories, {
    fields: [repositorySubscriptions.repositoryId],
    references: [repositories.id]
  })
}))

// Issue Subscriptions - Users subscribe to specific issues for activity notifications
export const issueSubscriptions = pgTable('issue_subscriptions', {
  issueId: bigint('issue_id', { mode: 'number' }).notNull().references(() => issues.id, { onDelete: 'cascade' }),
  userId: bigint('user_id', { mode: 'number' }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().defaultNow()
})

export const issueSubscriptionsRelations = relations(issueSubscriptions, ({ one }) => ({
  issue: one(issues, {
    fields: [issueSubscriptions.issueId],
    references: [issues.id]
  }),
  user: one(users, {
    fields: [issueSubscriptions.userId],
    references: [users.id]
  })
}))
