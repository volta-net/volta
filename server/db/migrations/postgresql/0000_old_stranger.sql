CREATE TABLE "installations" (
	"id" bigint PRIMARY KEY NOT NULL,
	"account_login" text NOT NULL,
	"account_id" bigint NOT NULL,
	"account_type" text NOT NULL,
	"avatar_url" text,
	"suspended" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue_assignees" (
	"issue_id" bigint NOT NULL,
	"user_id" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue_comments" (
	"id" bigint PRIMARY KEY NOT NULL,
	"issue_id" bigint NOT NULL,
	"user_id" bigint,
	"body" text NOT NULL,
	"html_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue_labels" (
	"issue_id" bigint NOT NULL,
	"label_id" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue_requested_reviewers" (
	"issue_id" bigint NOT NULL,
	"user_id" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue_review_comments" (
	"id" bigint PRIMARY KEY NOT NULL,
	"issue_id" bigint NOT NULL,
	"review_id" bigint,
	"user_id" bigint,
	"body" text NOT NULL,
	"path" text,
	"line" bigint,
	"side" text,
	"commit_id" text,
	"diff_hunk" text,
	"html_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue_reviews" (
	"id" bigint PRIMARY KEY NOT NULL,
	"issue_id" bigint NOT NULL,
	"user_id" bigint,
	"body" text,
	"state" text NOT NULL,
	"html_url" text,
	"commit_id" text,
	"submitted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issues" (
	"id" bigint PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"repository_id" bigint NOT NULL,
	"milestone_id" bigint,
	"user_id" bigint,
	"number" bigint NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"state" text NOT NULL,
	"state_reason" text,
	"html_url" text,
	"locked" boolean DEFAULT false,
	"draft" boolean DEFAULT false,
	"merged" boolean DEFAULT false,
	"commits" bigint DEFAULT 0,
	"additions" bigint DEFAULT 0,
	"deletions" bigint DEFAULT 0,
	"changed_files" bigint DEFAULT 0,
	"head_ref" text,
	"head_sha" text,
	"base_ref" text,
	"base_sha" text,
	"merged_at" timestamp,
	"closed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"synced" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "labels" (
	"id" bigint PRIMARY KEY NOT NULL,
	"repository_id" bigint NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"description" text,
	"default" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "milestones" (
	"id" bigint PRIMARY KEY NOT NULL,
	"repository_id" bigint NOT NULL,
	"number" bigint NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"state" text NOT NULL,
	"html_url" text,
	"open_issues" bigint DEFAULT 0,
	"closed_issues" bigint DEFAULT 0,
	"due_on" timestamp,
	"closed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"type" text NOT NULL,
	"body" text,
	"repository_id" bigint,
	"issue_id" bigint,
	"actor_id" bigint,
	"read" boolean DEFAULT false,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repositories" (
	"id" bigint PRIMARY KEY NOT NULL,
	"installation_id" bigint NOT NULL,
	"name" text NOT NULL,
	"full_name" text NOT NULL,
	"private" boolean DEFAULT false,
	"description" text,
	"html_url" text,
	"default_branch" text,
	"archived" boolean DEFAULT false,
	"disabled" boolean DEFAULT false,
	"sync_enabled" boolean DEFAULT true,
	"last_synced_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repository_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"repository_id" bigint NOT NULL,
	"issues" boolean DEFAULT true,
	"pull_requests" boolean DEFAULT true,
	"mentions" boolean DEFAULT true,
	"activity" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" bigint PRIMARY KEY NOT NULL,
	"login" text NOT NULL,
	"name" text,
	"email" text,
	"avatar_url" text,
	"registered" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "issue_assignees" ADD CONSTRAINT "issue_assignees_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_assignees" ADD CONSTRAINT "issue_assignees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_comments" ADD CONSTRAINT "issue_comments_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_comments" ADD CONSTRAINT "issue_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_labels" ADD CONSTRAINT "issue_labels_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_labels" ADD CONSTRAINT "issue_labels_label_id_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."labels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_requested_reviewers" ADD CONSTRAINT "issue_requested_reviewers_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_requested_reviewers" ADD CONSTRAINT "issue_requested_reviewers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_review_comments" ADD CONSTRAINT "issue_review_comments_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_review_comments" ADD CONSTRAINT "issue_review_comments_review_id_issue_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."issue_reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_review_comments" ADD CONSTRAINT "issue_review_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_reviews" ADD CONSTRAINT "issue_reviews_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_reviews" ADD CONSTRAINT "issue_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_milestone_id_milestones_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."milestones"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_installation_id_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."installations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_subscriptions" ADD CONSTRAINT "repository_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_subscriptions" ADD CONSTRAINT "repository_subscriptions_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;