import { pgTable, text, timestamp, bigint, boolean, jsonb, serial } from 'drizzle-orm/pg-core'
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

// Notification types
export type NotificationType = 'issue_opened' | 'issue_assigned' | 'issue_mentioned' | 'issue_comment' | 'pr_review_requested' | 'pr_review_submitted' | 'pr_comment' | 'pr_merged' | 'pr_closed'

// Notifications
export const notifications = pgTable('notifications', {
  id: serial().primaryKey(),
  // Who this notification is for
  userId: bigint('user_id', { mode: 'number' }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  // Notification content
  type: text().$type<NotificationType>().notNull(),
  body: text(), // Optional extra context (e.g., comment body)
  // Relations (populated via Drizzle)
  repositoryId: bigint('repository_id', { mode: 'number' }).references(() => repositories.id, { onDelete: 'cascade' }),
  issueId: bigint('issue_id', { mode: 'number' }).references(() => issues.id, { onDelete: 'cascade' }),
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
  nodeId: text('node_id').notNull(),
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

// Labels (matches GitHub API)
export const labels = pgTable('labels', {
  id: bigint({ mode: 'number' }).primaryKey(), // GitHub label ID
  nodeId: text('node_id'),
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
  nodeId: text('node_id'),
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
  nodeId: text('node_id'),
  type: text().$type<IssueType>().notNull(), // 'issue' | 'pull_request'
  repositoryId: bigint('repository_id', { mode: 'number' }).notNull().references(() => repositories.id, { onDelete: 'cascade' }),
  milestoneId: bigint('milestone_id', { mode: 'number' }).references(() => milestones.id, { onDelete: 'set null' }),
  number: bigint({ mode: 'number' }).notNull(),
  title: text().notNull(),
  body: text(),
  state: text().notNull(), // 'open' | 'closed'
  stateReason: text('state_reason'), // 'completed' | 'not_planned' | 'reopened' (issues only)
  htmlUrl: text('html_url'),
  locked: boolean().default(false),
  comments: bigint({ mode: 'number' }).default(0),
  // User info (flattened)
  userLogin: text('user_login'),
  userId: bigint('user_id', { mode: 'number' }),
  userAvatarUrl: text('user_avatar_url'),
  // Arrays stored as JSONB
  assignees: jsonb().$type<{ login: string, id: number, avatar_url: string }[]>().default([]),
  labels: jsonb().$type<{ id: number, name: string, color: string }[]>().default([]),
  // PR-specific fields (null for issues)
  draft: boolean().default(false),
  merged: boolean().default(false),
  reviewComments: bigint('review_comments', { mode: 'number' }).default(0),
  commits: bigint({ mode: 'number' }).default(0),
  additions: bigint({ mode: 'number' }).default(0),
  deletions: bigint({ mode: 'number' }).default(0),
  changedFiles: bigint('changed_files', { mode: 'number' }).default(0),
  headRef: text('head_ref'),
  headSha: text('head_sha'),
  baseRef: text('base_ref'),
  baseSha: text('base_sha'),
  requestedReviewers: jsonb('requested_reviewers').$type<{ login: string, id: number, avatar_url: string }[]>().default([]),
  mergedAt: timestamp('merged_at'),
  // Timestamps
  closedAt: timestamp('closed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
})

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  notifications: many(notifications, { relationName: 'notificationRecipient' }),
  actedNotifications: many(notifications, { relationName: 'notificationActor' }),
  subscriptions: many(repositorySubscriptions)
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
  milestones: many(milestones)
}))

export const issuesRelations = relations(issues, ({ one }) => ({
  repository: one(repositories, {
    fields: [issues.repositoryId],
    references: [repositories.id]
  }),
  milestone: one(milestones, {
    fields: [issues.milestoneId],
    references: [milestones.id]
  })
}))

export const labelsRelations = relations(labels, ({ one }) => ({
  repository: one(repositories, {
    fields: [labels.repositoryId],
    references: [repositories.id]
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
  // Notification preferences
  issues: boolean().default(true), // New issues
  pullRequests: boolean('pull_requests').default(true), // New PRs
  mentions: boolean().default(true), // @mentions
  activity: boolean().default(false), // All activity (comments, reviews, etc.)
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
