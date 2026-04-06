ALTER TABLE "issues" ADD COLUMN "resolution_suggested_action" text;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "resolution_draft_reply" text;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "resolution_duplicate_of" bigint;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "resolution_reasoning" text;