ALTER TABLE "issue_assignees" ADD CONSTRAINT "issue_assignees_issue_id_user_id_pk" PRIMARY KEY("issue_id","user_id");--> statement-breakpoint
ALTER TABLE "issue_labels" ADD CONSTRAINT "issue_labels_issue_id_label_id_pk" PRIMARY KEY("issue_id","label_id");--> statement-breakpoint
ALTER TABLE "issue_linked_prs" ADD CONSTRAINT "issue_linked_prs_issue_id_pr_id_pk" PRIMARY KEY("issue_id","pr_id");--> statement-breakpoint
ALTER TABLE "issue_requested_reviewers" ADD CONSTRAINT "issue_requested_reviewers_issue_id_user_id_pk" PRIMARY KEY("issue_id","user_id");--> statement-breakpoint
ALTER TABLE "issue_subscriptions" ADD CONSTRAINT "issue_subscriptions_issue_id_user_id_pk" PRIMARY KEY("issue_id","user_id");--> statement-breakpoint
ALTER TABLE "repository_collaborators" ADD CONSTRAINT "repository_collaborators_repository_id_user_id_pk" PRIMARY KEY("repository_id","user_id");