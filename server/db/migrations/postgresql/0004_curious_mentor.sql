DROP INDEX "check_runs_repository_id_idx";--> statement-breakpoint
DROP INDEX "check_runs_head_sha_idx";--> statement-breakpoint
DROP INDEX "favorite_repositories_user_id_idx";--> statement-breakpoint
DROP INDEX "issues_state_idx";--> statement-breakpoint
DROP INDEX "issues_number_idx";--> statement-breakpoint
DROP INDEX "issues_pull_request_idx";--> statement-breakpoint
DROP INDEX "notifications_user_id_idx";--> statement-breakpoint
DROP INDEX "notifications_created_at_idx";--> statement-breakpoint
CREATE INDEX "check_runs_repo_sha_idx" ON "check_runs" USING btree ("repository_id","head_sha");--> statement-breakpoint
CREATE INDEX "commit_statuses_repo_sha_idx" ON "commit_statuses" USING btree ("repository_id","sha");--> statement-breakpoint
CREATE UNIQUE INDEX "favorite_issues_user_issue_idx" ON "favorite_issues" USING btree ("user_id","issue_id");--> statement-breakpoint
CREATE UNIQUE INDEX "favorite_repositories_user_repo_idx" ON "favorite_repositories" USING btree ("user_id","repository_id");--> statement-breakpoint
CREATE INDEX "installations_account_id_idx" ON "installations" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "issue_comments_user_id_idx" ON "issue_comments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "issue_linked_prs_pr_id_idx" ON "issue_linked_prs" USING btree ("pr_id");--> statement-breakpoint
CREATE INDEX "issue_subscriptions_user_id_idx" ON "issue_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "issues_repo_pr_state_updated_idx" ON "issues" USING btree ("repository_id","pull_request","state","updated_at");--> statement-breakpoint
CREATE INDEX "issues_user_id_idx" ON "issues" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "labels_repository_id_idx" ON "labels" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "milestones_repository_id_idx" ON "milestones" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "notifications_user_read_created_idx" ON "notifications" USING btree ("user_id","read","created_at");--> statement-breakpoint
CREATE INDEX "notifications_user_issue_idx" ON "notifications" USING btree ("user_id","issue_id");--> statement-breakpoint
CREATE INDEX "releases_repository_id_idx" ON "releases" USING btree ("repository_id");--> statement-breakpoint
CREATE UNIQUE INDEX "repositories_full_name_idx" ON "repositories" USING btree ("full_name");--> statement-breakpoint
CREATE UNIQUE INDEX "repository_subscriptions_user_repo_idx" ON "repository_subscriptions" USING btree ("user_id","repository_id");--> statement-breakpoint
CREATE INDEX "repository_subscriptions_repo_idx" ON "repository_subscriptions" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "types_repository_id_idx" ON "types" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "users_login_idx" ON "users" USING btree ("login");