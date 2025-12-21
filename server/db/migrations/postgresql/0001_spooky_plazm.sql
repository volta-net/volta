ALTER TABLE "issues" ADD COLUMN "answered" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "answer_comment_id" bigint;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "answered_at" timestamp;