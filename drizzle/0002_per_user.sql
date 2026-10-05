ALTER TABLE "attempts" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "bookmark_events" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "question_progress" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD COLUMN "user_id" text;--> statement-breakpoint
CREATE INDEX "attempts_user_id_created_at_id_index" ON "attempts" USING btree ("user_id","created_at","id");--> statement-breakpoint
CREATE INDEX "bookmark_events_user_id_question_id_at_index" ON "bookmark_events" USING btree ("user_id","question_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "question_progress_user_id_question_id_index" ON "question_progress" USING btree ("user_id","question_id");--> statement-breakpoint
CREATE INDEX "question_progress_user_id_updated_at_question_id_index" ON "question_progress" USING btree ("user_id","updated_at","question_id");--> statement-breakpoint
CREATE INDEX "study_sessions_user_id_updated_at_id_index" ON "study_sessions" USING btree ("user_id","updated_at","id");