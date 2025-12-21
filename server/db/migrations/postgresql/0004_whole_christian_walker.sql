CREATE TABLE "check_runs" (
	"id" bigint PRIMARY KEY NOT NULL,
	"repository_id" bigint NOT NULL,
	"head_sha" text NOT NULL,
	"name" text NOT NULL,
	"status" text,
	"conclusion" text,
	"html_url" text,
	"details_url" text,
	"app_slug" text,
	"app_name" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "check_runs" ADD CONSTRAINT "check_runs_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;