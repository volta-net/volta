CREATE TABLE "commit_statuses" (
	"id" bigint PRIMARY KEY NOT NULL,
	"repository_id" bigint NOT NULL,
	"sha" text NOT NULL,
	"state" text NOT NULL,
	"context" text NOT NULL,
	"description" text,
	"target_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "commit_statuses" ADD CONSTRAINT "commit_statuses_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;