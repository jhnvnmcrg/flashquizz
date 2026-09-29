CREATE TYPE "public"."image_role" AS ENUM('stem', 'choice', 'rationale');--> statement-breakpoint
CREATE TYPE "public"."question_format" AS ENUM('single', 'except', 'roman_combo', 'two_statement', 'matching', 'computation');--> statement-breakpoint
CREATE TYPE "public"."question_status" AS ENUM('auto', 'verified', 'needs_review', 'archived');--> statement-breakpoint
CREATE TYPE "public"."session_mode" AS ENUM('flashcards', 'practice', 'review', 'exam');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('active', 'completed', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."study_order" AS ENUM('smart', 'random', 'sequential');--> statement-breakpoint
CREATE TABLE "attempts" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "attempts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"question_id" integer NOT NULL,
	"session_id" uuid,
	"mode" "session_mode" NOT NULL,
	"selected_key" text,
	"is_correct" boolean NOT NULL,
	"response_ms" integer,
	"answered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "modules" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "modules_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"slug" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"short_name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"accent_hue" smallint DEFAULT 195 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "modules_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "question_groups" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "question_groups_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"key" text NOT NULL,
	"source_id" integer NOT NULL,
	"module_id" integer NOT NULL,
	"context" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_groups_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "question_images" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "question_images_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"question_id" integer,
	"group_id" integer,
	"role" "image_role" NOT NULL,
	"choice_key" text,
	"alt" text DEFAULT '' NOT NULL,
	"mime" text NOT NULL,
	"width" integer,
	"height" integer,
	"byte_size" integer NOT NULL,
	"sha256" text NOT NULL,
	"data" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_images_owner_check" CHECK (num_nonnulls("question_images"."question_id", "question_images"."group_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "question_progress" (
	"question_id" integer PRIMARY KEY NOT NULL,
	"box" smallint DEFAULT 0 NOT NULL,
	"due_at" timestamp with time zone,
	"seen_count" integer DEFAULT 0 NOT NULL,
	"correct_count" integer DEFAULT 0 NOT NULL,
	"wrong_count" integer DEFAULT 0 NOT NULL,
	"streak" integer DEFAULT 0 NOT NULL,
	"last_correct" boolean,
	"last_answered_at" timestamp with time zone,
	"bookmarked" boolean DEFAULT false NOT NULL,
	"bookmarked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "questions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"source_ref" text NOT NULL,
	"source_id" integer NOT NULL,
	"module_id" integer NOT NULL,
	"topic_id" integer,
	"group_id" integer,
	"group_order" integer,
	"ordinal" integer DEFAULT 0 NOT NULL,
	"printed_number" text,
	"source_page" integer,
	"format" "question_format" DEFAULT 'single' NOT NULL,
	"stem" text NOT NULL,
	"statements" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"choices" jsonb NOT NULL,
	"answer_key" text,
	"rationale" text DEFAULT '' NOT NULL,
	"mnemonic" text DEFAULT '' NOT NULL,
	"status" "question_status" DEFAULT 'auto' NOT NULL,
	"flags" text[] DEFAULT '{}'::text[] NOT NULL,
	"requires_image" boolean DEFAULT false NOT NULL,
	"duplicate_of_ref" text,
	"review_note" text DEFAULT '' NOT NULL,
	"raw" jsonb,
	"edited_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "questions_sourceRef_unique" UNIQUE("source_ref"),
	CONSTRAINT "questions_answer_key_check" CHECK ("questions"."answer_key" IS NULL OR "questions"."answer_key" IN ('A','B','C','D','E'))
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sources_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"short_name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sources_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "study_session_items" (
	"session_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"question_id" integer NOT NULL,
	"selected_key" text,
	"is_correct" boolean,
	"answered_at" timestamp with time zone,
	"response_ms" integer,
	"flagged" boolean DEFAULT false NOT NULL,
	CONSTRAINT "study_session_items_session_id_position_pk" PRIMARY KEY("session_id","position")
);
--> statement-breakpoint
CREATE TABLE "study_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mode" "session_mode" NOT NULL,
	"status" "session_status" DEFAULT 'active' NOT NULL,
	"filters" jsonb NOT NULL,
	"order_mode" "study_order" DEFAULT 'smart' NOT NULL,
	"question_count" integer NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"duration_sec" integer,
	"expires_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"auto_submitted" boolean DEFAULT false NOT NULL,
	"answered_count" integer DEFAULT 0 NOT NULL,
	"correct_count" integer DEFAULT 0 NOT NULL,
	"last_position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "study_sessions_exam_timer_check" CHECK ("study_sessions"."mode" <> 'exam' OR ("study_sessions"."duration_sec" IS NOT NULL AND "study_sessions"."expires_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "subjects_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"module_id" integer NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subjects_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "topics" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "topics_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"subject_id" integer NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "topics_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_session_id_study_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."study_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_groups" ADD CONSTRAINT "question_groups_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_groups" ADD CONSTRAINT "question_groups_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_images" ADD CONSTRAINT "question_images_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_images" ADD CONSTRAINT "question_images_group_id_question_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."question_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_progress" ADD CONSTRAINT "question_progress_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_group_id_question_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."question_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_session_items" ADD CONSTRAINT "study_session_items_session_id_study_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."study_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_session_items" ADD CONSTRAINT "study_session_items_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attempts_question_id_answered_at_index" ON "attempts" USING btree ("question_id","answered_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "attempts_answered_at_index" ON "attempts" USING btree ("answered_at");--> statement-breakpoint
CREATE UNIQUE INDEX "question_images_question_id_sha256_index" ON "question_images" USING btree ("question_id","sha256");--> statement-breakpoint
CREATE INDEX "question_images_group_id_index" ON "question_images" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "question_progress_due_idx" ON "question_progress" USING btree ("due_at") WHERE "question_progress"."box" > 0;--> statement-breakpoint
CREATE INDEX "question_progress_bookmarked_idx" ON "question_progress" USING btree ("bookmarked_at") WHERE "question_progress"."bookmarked";--> statement-breakpoint
CREATE INDEX "questions_module_id_status_index" ON "questions" USING btree ("module_id","status");--> statement-breakpoint
CREATE INDEX "questions_topic_id_index" ON "questions" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "questions_source_id_ordinal_index" ON "questions" USING btree ("source_id","ordinal");--> statement-breakpoint
CREATE INDEX "questions_group_id_index" ON "questions" USING btree ("group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "study_session_items_session_id_question_id_index" ON "study_session_items" USING btree ("session_id","question_id");--> statement-breakpoint
CREATE INDEX "study_session_items_question_id_index" ON "study_session_items" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "study_sessions_status_mode_started_at_index" ON "study_sessions" USING btree ("status","mode","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "subjects_module_id_sort_order_index" ON "subjects" USING btree ("module_id","sort_order");--> statement-breakpoint
CREATE INDEX "topics_subject_id_sort_order_index" ON "topics" USING btree ("subject_id","sort_order");