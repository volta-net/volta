ALTER TABLE "issues" ADD COLUMN "resolution_status" text;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "resolution_answered_by_id" integer;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "resolution_answer_comment_id" integer;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "resolution_confidence" integer;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "resolution_analyzed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_resolution_answered_by_id_users_id_fk" FOREIGN KEY ("resolution_answered_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;