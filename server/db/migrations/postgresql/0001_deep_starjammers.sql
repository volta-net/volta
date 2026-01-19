CREATE INDEX "favorite_repositories_user_id_idx" ON "favorite_repositories" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "issue_comments_issue_id_idx" ON "issue_comments" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "issues_state_idx" ON "issues" USING btree ("state");--> statement-breakpoint
CREATE INDEX "issues_head_sha_idx" ON "issues" USING btree ("head_sha");--> statement-breakpoint
CREATE INDEX "issues_number_idx" ON "issues" USING btree ("number");--> statement-breakpoint
CREATE INDEX "repository_collaborators_user_id_idx" ON "repository_collaborators" USING btree ("user_id");