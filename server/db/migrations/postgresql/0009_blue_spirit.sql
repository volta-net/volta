-- Remove duplicate notifications per user+issue (keep the most recent one)
DELETE FROM "notifications" n1
  USING "notifications" n2
  WHERE n1."user_id" = n2."user_id"
    AND n1."issue_id" IS NOT NULL
    AND n1."issue_id" = n2."issue_id"
    AND n1."id" < n2."id";--> statement-breakpoint
DROP INDEX "notifications_user_issue_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_user_issue_unique_idx" ON "notifications" USING btree ("user_id","issue_id");