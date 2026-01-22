import { pgTable, text, timestamp, bigint, boolean, serial, primaryKey, uniqueIndex, index, integer } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

// Users (GitHub users - both registered and shadow users from imports)
export const users = pgTable('users', {
  id: serial().primaryKey(), // Auto-generated stable ID
  githubId: bigint('github_id', { mode: 'number' }).notNull(), // GitHub user ID (for lookups)
  login: text().notNull(),
  name: text(),
  email: text(),
  avatarUrl: text('avatar_url'),
  // True if user has logged into the app, false for shadow users from imports
  registered: boolean().default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, table => ([
  uniqueIndex('users_github_id_idx').on(table.githubId),
  // Index for @mention lookups (getMentionedUserIds in notifications.ts)
  index('users_login_idx').on(table.login)
]))

// Notification types (what entity the notification is about)
export type NotificationType = 'issue' | 'pull_request' | 'release' | 'workflow_run'

// AI Resolution status for issues (not PRs)
export type ResolutionStatus = 'answered' | 'likely_resolved' | 'waiting_on_author' | 'needs_attention'

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
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  // Notification content
  type: text().$type<NotificationType>().notNull(),
  action: text().$type<NotificationAction>().notNull(),
  body: text(), // Optional extra context (e.g., comment body)
  // Relations (populated via Drizzle)
  repositoryId: integer('repository_id').references(() => repositories.id, { onDelete: 'cascade' }),
  issueId: integer('issue_id').references(() => issues.id, { onDelete: 'cascade' }),
  releaseId: integer('release_id').references(() => releases.id, { onDelete: 'cascade' }),
  workflowRunId: integer('workflow_run_id').references(() => workflowRuns.id, { onDelete: 'cascade' }),
  // Actor (who triggered the notification)
  actorId: integer('actor_id').references(() => users.id, { onDelete: 'set null' }),
  // Status
  read: boolean().default(false),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, table => ([
  // Composite index for all notification queries (userId + read filter + createdAt sort)
  index('notifications_user_read_created_idx').on(table.userId, table.read, table.createdAt),
  // Index for notification deduplication (checking if notification exists for user+issue)
  index('notifications_user_issue_idx').on(table.userId, table.issueId)
]))

// GitHub App Installations
export const installations = pgTable('installations', {
  id: serial().primaryKey(), // Auto-generated stable ID
  githubId: bigint('github_id', { mode: 'number' }).notNull(), // GitHub installation ID
  accountLogin: text('account_login').notNull(),
  accountId: bigint('account_id', { mode: 'number' }).notNull(),
  accountType: text('account_type').notNull(), // 'User' | 'Organization'
  avatarUrl: text('avatar_url'),
  suspended: boolean().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, table => ([
  uniqueIndex('installations_github_id_idx').on(table.githubId),
  // Index for account-based lookups (installations.get.ts, sync.ts)
  index('installations_account_id_idx').on(table.accountId)
]))

// Repositories (matches GitHub API)
export const repositories = pgTable('repositories', {
  id: serial().primaryKey(), // Auto-generated stable ID
  githubId: bigint('github_id', { mode: 'number' }).notNull(), // GitHub repo ID
  installationId: integer('installation_id').notNull().references(() => installations.id, { onDelete: 'cascade' }),
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
  syncing: boolean().default(false),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, table => ([
  uniqueIndex('repositories_github_id_idx').on(table.githubId),
  // Index for owner/name lookups (used by all issue detail routes)
  uniqueIndex('repositories_full_name_idx').on(table.fullName)
]))

// Releases (matches GitHub API)
export const releases = pgTable('releases', {
  id: serial().primaryKey(), // Auto-generated stable ID
  githubId: bigint('github_id', { mode: 'number' }).notNull(), // GitHub release ID
  repositoryId: integer('repository_id').notNull().references(() => repositories.id, { onDelete: 'cascade' }),
  authorId: integer('author_id').references(() => users.id, { onDelete: 'set null' }),
  tagName: text('tag_name').notNull(),
  name: text(),
  body: text(),
  draft: boolean().default(false),
  prerelease: boolean().default(false),
  htmlUrl: text('html_url'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, table => ([
  uniqueIndex('releases_github_id_idx').on(table.githubId),
  // Index for fetching releases by repository
  index('releases_repository_id_idx').on(table.repositoryId)
]))

// Workflow run conclusions
export type WorkflowConclusion = 'success' | 'failure' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required' | 'stale' | 'neutral' | 'startup_failure'

// Workflow Runs (GitHub Actions)
export const workflowRuns = pgTable('workflow_runs', {
  id: serial().primaryKey(), // Auto-generated stable ID
  githubId: bigint('github_id', { mode: 'number' }).notNull(), // GitHub workflow run ID
  repositoryId: integer('repository_id').notNull().references(() => repositories.id, { onDelete: 'cascade' }),
  issueId: integer('issue_id').references(() => issues.id, { onDelete: 'set null' }), // Related PR (if triggered by pull_request event)
  actorId: integer('actor_id').references(() => users.id, { onDelete: 'set null' }),
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
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, table => ([
  uniqueIndex('workflow_runs_github_id_idx').on(table.githubId)
]))

// Check Runs (third-party integrations like Vercel, CircleCI, etc.)
export const checkRuns = pgTable('check_runs', {
  id: serial().primaryKey(), // Auto-generated stable ID
  githubId: bigint('github_id', { mode: 'number' }).notNull(), // GitHub check run ID
  repositoryId: integer('repository_id').notNull().references(() => repositories.id, { onDelete: 'cascade' }),
  headSha: text('head_sha').notNull(),
  name: text().notNull(), // Check name (e.g., "Vercel – my-app")
  status: text(), // queued, in_progress, completed
  conclusion: text().$type<WorkflowConclusion>(), // success, failure, etc.
  htmlUrl: text('html_url'),
  detailsUrl: text('details_url'), // External URL (e.g., Vercel deployment URL)
  appSlug: text('app_slug'), // App identifier (e.g., "vercel", "circleci")
  appName: text('app_name'), // App display name
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, table => ([
  uniqueIndex('check_runs_github_id_idx').on(table.githubId),
  // Composite index for CI status queries (filters by both repositoryId AND headSha)
  index('check_runs_repo_sha_idx').on(table.repositoryId, table.headSha)
]))

// Commit Status state (from GitHub Status API - older API used by Vercel deployments, etc.)
export type CommitStatusState = 'error' | 'failure' | 'pending' | 'success'

// Commit Statuses (GitHub Status API - used by Vercel deployments, external CI, etc.)
export const commitStatuses = pgTable('commit_statuses', {
  id: serial().primaryKey(), // Auto-generated stable ID
  githubId: bigint('github_id', { mode: 'number' }).notNull(), // GitHub status ID
  repositoryId: integer('repository_id').notNull().references(() => repositories.id, { onDelete: 'cascade' }),
  sha: text().notNull(), // Commit SHA
  state: text().$type<CommitStatusState>().notNull(), // error, failure, pending, success
  context: text().notNull(), // Status context (e.g., "Vercel", "continuous-integration/travis-ci")
  description: text(), // Short description
  targetUrl: text('target_url'), // Link to external service
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, table => ([
  uniqueIndex('commit_statuses_github_id_idx').on(table.githubId),
  index('commit_statuses_repo_sha_idx').on(table.repositoryId, table.sha)
]))

// Labels (matches GitHub API)
export const labels = pgTable('labels', {
  id: serial().primaryKey(), // Auto-generated stable ID
  githubId: bigint('github_id', { mode: 'number' }).notNull(), // GitHub label ID
  repositoryId: integer('repository_id').notNull().references(() => repositories.id, { onDelete: 'cascade' }),
  name: text().notNull(),
  color: text().notNull(),
  description: text(),
  default: boolean().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, table => ([
  uniqueIndex('labels_github_id_idx').on(table.githubId),
  // Index for fetching labels by repository (labels.get.ts)
  index('labels_repository_id_idx').on(table.repositoryId)
]))

// Types (GitHub issue types - Bug, Feature, etc.)
export const types = pgTable('types', {
  id: serial().primaryKey(), // Auto-generated stable ID
  githubId: bigint('github_id', { mode: 'number' }).notNull(), // GitHub issue type ID
  repositoryId: integer('repository_id').notNull().references(() => repositories.id, { onDelete: 'cascade' }),
  name: text().notNull(),
  description: text(),
  color: text(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, table => ([
  uniqueIndex('types_github_id_idx').on(table.githubId),
  // Index for fetching types by repository (consistent with labels)
  index('types_repository_id_idx').on(table.repositoryId)
]))

// Milestones (matches GitHub API)
export const milestones = pgTable('milestones', {
  id: serial().primaryKey(), // Auto-generated stable ID
  githubId: bigint('github_id', { mode: 'number' }).notNull(), // GitHub milestone ID
  repositoryId: integer('repository_id').notNull().references(() => repositories.id, { onDelete: 'cascade' }),
  number: bigint({ mode: 'number' }).notNull(),
  title: text().notNull(),
  description: text(),
  state: text().notNull(), // 'open' | 'closed'
  htmlUrl: text('html_url'),
  openIssues: bigint('open_issues', { mode: 'number' }).default(0),
  closedIssues: bigint('closed_issues', { mode: 'number' }).default(0),
  dueOn: timestamp('due_on', { withTimezone: true }),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, table => ([
  uniqueIndex('milestones_github_id_idx').on(table.githubId),
  // Index for fetching milestones by repository
  index('milestones_repository_id_idx').on(table.repositoryId)
]))

// Issues (Issues & Pull Requests unified)
export const issues = pgTable('issues', {
  id: serial().primaryKey(), // Auto-generated stable ID
  githubId: bigint('github_id', { mode: 'number' }), // GitHub's ID (for reference only - not reliable as PK)
  pullRequest: boolean('pull_request').default(false).notNull(), // true for PRs, false for issues
  repositoryId: integer('repository_id').notNull().references(() => repositories.id, { onDelete: 'cascade' }),
  milestoneId: integer('milestone_id').references(() => milestones.id, { onDelete: 'set null' }),
  typeId: integer('type_id').references(() => types.id, { onDelete: 'set null' }), // GitHub issue type (Bug, Feature, etc.)
  // Author (relation to users - shadow user created if needed)
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
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
  mergedAt: timestamp('merged_at', { withTimezone: true }),
  mergedById: integer('merged_by_id').references(() => users.id, { onDelete: 'set null' }),
  // Timestamps
  closedAt: timestamp('closed_at', { withTimezone: true }),
  closedById: integer('closed_by_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  // Engagement metrics (from GitHub API)
  reactionCount: bigint('reaction_count', { mode: 'number' }).default(0),
  commentCount: bigint('comment_count', { mode: 'number' }).default(0),
  // Sync status - false until full data (comments, reactions, etc.) has been fetched from GitHub
  synced: boolean().default(false).notNull(),
  // When we last synced this issue from GitHub (for staleness checks)
  syncedAt: timestamp('synced_at', { withTimezone: true }),
  // AI Resolution Analysis (issues only, not PRs)
  resolutionStatus: text('resolution_status').$type<'answered' | 'likely_resolved' | 'waiting_on_author' | 'needs_attention'>(),
  resolutionAnsweredById: integer('resolution_answered_by_id').references(() => users.id, { onDelete: 'set null' }),
  resolutionAnswerCommentId: integer('resolution_answer_comment_id'),
  resolutionConfidence: integer('resolution_confidence'), // 0-100 percentage
  resolutionAnalyzedAt: timestamp('resolution_analyzed_at', { withTimezone: true })
}, table => ([
  // The true unique identifier is (repositoryId, number), not GitHub's ID
  uniqueIndex('issues_repo_number_idx').on(table.repositoryId, table.number),
  // Composite index for main filter pattern (repository + pull_request + state + sort)
  // Covers queries filtering by any prefix: repo, repo+pr, repo+pr+state, repo+pr+state+updatedAt
  index('issues_repo_pr_state_updated_idx').on(table.repositoryId, table.pullRequest, table.state, table.updatedAt),
  // Index for CI status lookups (headSha not covered by composite)
  index('issues_head_sha_idx').on(table.headSha),
  // Index for author lookups
  index('issues_user_id_idx').on(table.userId)
]))

// Issue Assignees (many-to-many: issues <-> users)
export const issueAssignees = pgTable('issue_assignees', {
  issueId: integer('issue_id').notNull().references(() => issues.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' })
}, table => ([
  primaryKey({ columns: [table.issueId, table.userId] }),
  index('issue_assignees_issue_id_idx').on(table.issueId)
]))

// Issue Labels (many-to-many: issues <-> labels)
export const issueLabels = pgTable('issue_labels', {
  issueId: integer('issue_id').notNull().references(() => issues.id, { onDelete: 'cascade' }),
  labelId: integer('label_id').notNull().references(() => labels.id, { onDelete: 'cascade' })
}, table => ([
  primaryKey({ columns: [table.issueId, table.labelId] }),
  index('issue_labels_issue_id_idx').on(table.issueId)
]))

// Issue Requested Reviewers (many-to-many: issues <-> users, for PRs)
export const issueRequestedReviewers = pgTable('issue_requested_reviewers', {
  issueId: integer('issue_id').notNull().references(() => issues.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' })
}, table => ([
  primaryKey({ columns: [table.issueId, table.userId] })
]))

// Issue Linked PRs (many-to-many: issues <-> PRs)
// Links issues to PRs that reference them with closing keywords (fixes #, closes #, etc.)
export const issueLinkedPrs = pgTable('issue_linked_prs', {
  issueId: integer('issue_id').notNull().references(() => issues.id, { onDelete: 'cascade' }),
  prId: integer('pr_id').notNull().references(() => issues.id, { onDelete: 'cascade' })
}, table => ([
  primaryKey({ columns: [table.issueId, table.prId] }),
  // Index for reverse lookups (getLinkedIssuesForPRs - finding issues linked to a PR)
  index('issue_linked_prs_pr_id_idx').on(table.prId)
]))

// Issue Comments (general comments on issues/PRs)
export const issueComments = pgTable('issue_comments', {
  id: serial().primaryKey(), // Auto-generated stable ID
  githubId: bigint('github_id', { mode: 'number' }).notNull(), // GitHub comment ID
  issueId: integer('issue_id').notNull().references(() => issues.id, { onDelete: 'cascade' }),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  body: text().notNull(),
  htmlUrl: text('html_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, table => ([
  uniqueIndex('issue_comments_github_id_idx').on(table.githubId),
  index('issue_comments_issue_id_idx').on(table.issueId),
  index('issue_comments_user_id_idx').on(table.userId)
]))

// Review state
export type ReviewState = 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED' | 'PENDING'

// Issue Reviews (PR review submissions with state)
export const issueReviews = pgTable('issue_reviews', {
  id: serial().primaryKey(), // Auto-generated stable ID
  githubId: bigint('github_id', { mode: 'number' }).notNull(), // GitHub review ID
  issueId: integer('issue_id').notNull().references(() => issues.id, { onDelete: 'cascade' }),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  body: text(),
  state: text().$type<ReviewState>().notNull(),
  htmlUrl: text('html_url'),
  commitId: text('commit_id'),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, table => ([
  uniqueIndex('issue_reviews_github_id_idx').on(table.githubId),
  index('issue_reviews_issue_id_idx').on(table.issueId)
]))

// Issue Review Comments (inline code comments on PRs)
export const issueReviewComments = pgTable('issue_review_comments', {
  id: serial().primaryKey(), // Auto-generated stable ID
  githubId: bigint('github_id', { mode: 'number' }).notNull(), // GitHub comment ID
  issueId: integer('issue_id').notNull().references(() => issues.id, { onDelete: 'cascade' }),
  reviewId: integer('review_id').references(() => issueReviews.id, { onDelete: 'cascade' }),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  body: text().notNull(),
  path: text(), // File path
  line: bigint({ mode: 'number' }), // Line number
  side: text(), // 'LEFT' or 'RIGHT'
  commitId: text('commit_id'),
  diffHunk: text('diff_hunk'),
  htmlUrl: text('html_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, table => ([
  uniqueIndex('issue_review_comments_github_id_idx').on(table.githubId),
  index('issue_review_comments_issue_id_idx').on(table.issueId)
]))

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  issues: many(issues),
  closedIssues: many(issues, { relationName: 'issueClosedBy' }),
  mergedIssues: many(issues, { relationName: 'issueMergedBy' }),
  resolutionAnsweredIssues: many(issues, { relationName: 'issueResolutionAnsweredBy' }),
  assignedIssues: many(issueAssignees),
  reviewRequests: many(issueRequestedReviewers),
  comments: many(issueComments),
  reviews: many(issueReviews),
  reviewComments: many(issueReviewComments),
  notifications: many(notifications, { relationName: 'notificationRecipient' }),
  actedNotifications: many(notifications, { relationName: 'notificationActor' }),
  subscriptions: many(repositorySubscriptions),
  issueSubscriptions: many(issueSubscriptions),
  favoriteRepositories: many(favoriteRepositories),
  favoriteIssues: many(favoriteIssues)
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
  types: many(types),
  milestones: many(milestones),
  releases: many(releases),
  workflowRuns: many(workflowRuns),
  checkRuns: many(checkRuns),
  commitStatuses: many(commitStatuses),
  favorites: many(favoriteRepositories),
  collaborators: many(repositoryCollaborators)
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
  issue: one(issues, {
    fields: [workflowRuns.issueId],
    references: [issues.id]
  }),
  actor: one(users, {
    fields: [workflowRuns.actorId],
    references: [users.id]
  })
}))

export const checkRunsRelations = relations(checkRuns, ({ one }) => ({
  repository: one(repositories, {
    fields: [checkRuns.repositoryId],
    references: [repositories.id]
  })
}))

export const commitStatusesRelations = relations(commitStatuses, ({ one }) => ({
  repository: one(repositories, {
    fields: [commitStatuses.repositoryId],
    references: [repositories.id]
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
  type: one(types, {
    fields: [issues.typeId],
    references: [types.id]
  }),
  user: one(users, {
    fields: [issues.userId],
    references: [users.id]
  }),
  closedBy: one(users, {
    fields: [issues.closedById],
    references: [users.id],
    relationName: 'issueClosedBy'
  }),
  mergedBy: one(users, {
    fields: [issues.mergedById],
    references: [users.id],
    relationName: 'issueMergedBy'
  }),
  resolutionAnsweredBy: one(users, {
    fields: [issues.resolutionAnsweredById],
    references: [users.id],
    relationName: 'issueResolutionAnsweredBy'
  }),
  assignees: many(issueAssignees),
  labels: many(issueLabels),
  requestedReviewers: many(issueRequestedReviewers),
  linkedPrs: many(issueLinkedPrs, { relationName: 'issueToLinkedPrs' }),
  linkedIssues: many(issueLinkedPrs, { relationName: 'prToLinkedIssues' }),
  comments: many(issueComments),
  reviews: many(issueReviews),
  reviewComments: many(issueReviewComments),
  subscriptions: many(issueSubscriptions),
  favorites: many(favoriteIssues)
}))

export const labelsRelations = relations(labels, ({ one, many }) => ({
  repository: one(repositories, {
    fields: [labels.repositoryId],
    references: [repositories.id]
  }),
  issues: many(issueLabels)
}))

export const typesRelations = relations(types, ({ one, many }) => ({
  repository: one(repositories, {
    fields: [types.repositoryId],
    references: [repositories.id]
  }),
  issues: many(issues)
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

export const issueLinkedPrsRelations = relations(issueLinkedPrs, ({ one }) => ({
  issue: one(issues, {
    fields: [issueLinkedPrs.issueId],
    references: [issues.id],
    relationName: 'issueToLinkedPrs'
  }),
  pr: one(issues, {
    fields: [issueLinkedPrs.prId],
    references: [issues.id],
    relationName: 'prToLinkedIssues'
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
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  repositoryId: integer('repository_id').notNull().references(() => repositories.id, { onDelete: 'cascade' }),
  // Notification preferences (all enabled by default for maintainers)
  issues: boolean().default(true), // New issues
  pullRequests: boolean('pull_requests').default(true), // New PRs
  releases: boolean().default(true), // New releases
  ci: boolean().default(true), // CI failures
  mentions: boolean().default(true), // @mentions
  activity: boolean().default(true), // All activity (comments, reviews, etc.)
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, table => ([
  // Unique constraint prevents duplicate subscriptions (user can't subscribe to same repo twice)
  uniqueIndex('repository_subscriptions_user_repo_idx').on(table.userId, table.repositoryId),
  // Index for getting all subscribers of a repository (notifications)
  index('repository_subscriptions_repo_idx').on(table.repositoryId)
]))

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
  issueId: integer('issue_id').notNull().references(() => issues.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, table => ([
  primaryKey({ columns: [table.issueId, table.userId] }),
  // Index for getting all issues a user is subscribed to
  index('issue_subscriptions_user_id_idx').on(table.userId)
]))

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

// Favorite Repositories - repos user wants on dashboard
export const favoriteRepositories = pgTable('favorite_repositories', {
  id: serial().primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  repositoryId: integer('repository_id').notNull().references(() => repositories.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, table => ([
  // Unique constraint prevents duplicate favorites + serves as index for user lookups
  uniqueIndex('favorite_repositories_user_repo_idx').on(table.userId, table.repositoryId)
]))

export const favoriteRepositoriesRelations = relations(favoriteRepositories, ({ one }) => ({
  user: one(users, {
    fields: [favoriteRepositories.userId],
    references: [users.id]
  }),
  repository: one(repositories, {
    fields: [favoriteRepositories.repositoryId],
    references: [repositories.id]
  })
}))

// Repository Collaborators - users with write access to a repository
export type CollaboratorPermission = 'admin' | 'maintain' | 'write' | 'triage' | 'read'

export const repositoryCollaborators = pgTable('repository_collaborators', {
  repositoryId: integer('repository_id').notNull().references(() => repositories.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  permission: text().$type<CollaboratorPermission>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, table => ([
  primaryKey({ columns: [table.repositoryId, table.userId] }),
  index('repository_collaborators_user_id_idx').on(table.userId)
]))

export const repositoryCollaboratorsRelations = relations(repositoryCollaborators, ({ one }) => ({
  repository: one(repositories, {
    fields: [repositoryCollaborators.repositoryId],
    references: [repositories.id]
  }),
  user: one(users, {
    fields: [repositoryCollaborators.userId],
    references: [users.id]
  })
}))

// Favorite Issues - issues for quick sidebar access
export const favoriteIssues = pgTable('favorite_issues', {
  id: serial().primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  issueId: integer('issue_id').notNull().references(() => issues.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, table => ([
  // Unique constraint prevents duplicate favorites + serves as index for user lookups
  uniqueIndex('favorite_issues_user_issue_idx').on(table.userId, table.issueId)
]))

export const favoriteIssuesRelations = relations(favoriteIssues, ({ one }) => ({
  user: one(users, {
    fields: [favoriteIssues.userId],
    references: [users.id]
  }),
  issue: one(issues, {
    fields: [favoriteIssues.issueId],
    references: [issues.id]
  })
}))
