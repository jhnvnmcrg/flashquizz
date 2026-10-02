CREATE TABLE "bookmark_events" (
	"client_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" integer NOT NULL,
	"bookmarked" boolean NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "client_id" uuid;--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "bookmark_events" ADD CONSTRAINT "bookmark_events_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bookmark_events_question_id_at_index" ON "bookmark_events" USING btree ("question_id","at");--> statement-breakpoint
CREATE INDEX "attempts_created_at_id_index" ON "attempts" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "question_progress_updated_at_question_id_index" ON "question_progress" USING btree ("updated_at","question_id");--> statement-breakpoint
CREATE INDEX "study_sessions_updated_at_id_index" ON "study_sessions" USING btree ("updated_at","id");--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_clientId_unique" UNIQUE("client_id");--> statement-breakpoint
-- Backfill: existing attempts were stored the moment they were answered.
UPDATE "attempts" SET "created_at" = "answered_at";--> statement-breakpoint
-- Backfill: one event per currently bookmarked question, so progress rebuilt
-- from history keeps those cards in the review deck.
INSERT INTO "bookmark_events" ("question_id", "bookmarked", "at")
SELECT "question_id", true, coalesce("bookmarked_at", "updated_at") FROM "question_progress" WHERE "bookmarked";