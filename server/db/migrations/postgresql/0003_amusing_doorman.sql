CREATE INDEX "check_runs_repository_id_idx" ON "check_runs" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "check_runs_head_sha_idx" ON "check_runs" USING btree ("head_sha");--> statement-breakpoint
CREATE INDEX "issue_assignees_issue_id_idx" ON "issue_assignees" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "issue_labels_issue_id_idx" ON "issue_labels" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "issue_review_comments_issue_id_idx" ON "issue_review_comments" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "issue_reviews_issue_id_idx" ON "issue_reviews" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "issues_pull_request_idx" ON "issues" USING btree ("pull_request");--> statement-breakpoint
CREATE INDEX "notifications_user_id_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_created_at_idx" ON "notifications" USING btree ("created_at");