-- Every row has an owner now: drop the stopgap default (the first admin, set by
-- scripts/claim-existing-progress.ts while the previous deployment still wrote rows).
ALTER TABLE "attempts" ALTER COLUMN "user_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "bookmark_events" ALTER COLUMN "user_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "question_progress" ALTER COLUMN "user_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "study_sessions" ALTER COLUMN "user_id" DROP DEFAULT;--> statement-breakpoint
DROP INDEX "attempts_created_at_id_index";--> statement-breakpoint
DROP INDEX "question_progress_due_idx";--> statement-breakpoint
DROP INDEX "question_progress_bookmarked_idx";--> statement-breakpoint
DROP INDEX "question_progress_updated_at_question_id_index";--> statement-breakpoint
DROP INDEX "question_progress_user_id_question_id_index";--> statement-breakpoint
DROP INDEX "study_sessions_updated_at_id_index";--> statement-breakpoint
ALTER TABLE "attempts" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "bookmark_events" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
-- Progress is per person: the key moves from (question_id) to (user_id, question_id).
ALTER TABLE "question_progress" DROP CONSTRAINT "question_progress_pkey";--> statement-breakpoint
ALTER TABLE "question_progress" ALTER COLUMN "question_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "question_progress" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "study_sessions" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "question_progress" ADD CONSTRAINT "question_progress_user_id_question_id_pk" PRIMARY KEY("user_id","question_id");
