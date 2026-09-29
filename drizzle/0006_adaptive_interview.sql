CREATE TABLE IF NOT EXISTS "interview_sessions" (
  "id" serial PRIMARY KEY NOT NULL,
  "profile_id" integer NOT NULL,
  "job_id" integer NOT NULL,
  "application_id" integer,
  "package_id" integer,
  "status" varchar(40) DEFAULT 'active' NOT NULL,
  "mode" varchar(40) DEFAULT 'mixed' NOT NULL,
  "question_count" integer DEFAULT 0 NOT NULL,
  "answered_count" integer DEFAULT 0 NOT NULL,
  "overall_score" integer,
  "readiness_score" integer,
  "summary" text,
  "strengths" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "gaps" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "started_at" timestamptz DEFAULT now() NOT NULL,
  "completed_at" timestamptz,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "interview_sessions_profile_idx" ON "interview_sessions" USING btree ("profile_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "interview_sessions_profile_job_idx" ON "interview_sessions" USING btree ("profile_id","job_id","created_at");
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'interview_sessions_profile_id_profiles_id_fk') THEN
    ALTER TABLE "interview_sessions"
      ADD CONSTRAINT "interview_sessions_profile_id_profiles_id_fk"
      FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE cascade;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'interview_sessions_job_id_jobs_id_fk') THEN
    ALTER TABLE "interview_sessions"
      ADD CONSTRAINT "interview_sessions_job_id_jobs_id_fk"
      FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE cascade;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'interview_sessions_application_id_applications_id_fk') THEN
    ALTER TABLE "interview_sessions"
      ADD CONSTRAINT "interview_sessions_application_id_applications_id_fk"
      FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE set null;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'interview_sessions_package_id_application_packages_id_fk') THEN
    ALTER TABLE "interview_sessions"
      ADD CONSTRAINT "interview_sessions_package_id_application_packages_id_fk"
      FOREIGN KEY ("package_id") REFERENCES "application_packages"("id") ON DELETE set null;
  END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "interview_questions" (
  "id" serial PRIMARY KEY NOT NULL,
  "session_id" integer NOT NULL,
  "sequence" integer NOT NULL,
  "type" varchar(40) NOT NULL,
  "area" varchar(160) NOT NULL,
  "question" text NOT NULL,
  "expected_signals" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "evidence_context" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "is_follow_up" boolean DEFAULT false NOT NULL,
  "parent_question_id" integer,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "interview_questions_session_sequence_idx" ON "interview_questions" USING btree ("session_id","sequence");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "interview_questions_session_idx" ON "interview_questions" USING btree ("session_id","sequence");
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'interview_questions_session_id_interview_sessions_id_fk') THEN
    ALTER TABLE "interview_questions"
      ADD CONSTRAINT "interview_questions_session_id_interview_sessions_id_fk"
      FOREIGN KEY ("session_id") REFERENCES "interview_sessions"("id") ON DELETE cascade;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'interview_questions_parent_question_id_interview_questions_id_fk') THEN
    ALTER TABLE "interview_questions"
      ADD CONSTRAINT "interview_questions_parent_question_id_interview_questions_id_fk"
      FOREIGN KEY ("parent_question_id") REFERENCES "interview_questions"("id") ON DELETE set null;
  END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "interview_answers" (
  "id" serial PRIMARY KEY NOT NULL,
  "session_id" integer NOT NULL,
  "question_id" integer NOT NULL,
  "attempt" integer DEFAULT 1 NOT NULL,
  "answer_text" text NOT NULL,
  "score" integer NOT NULL,
  "confidence" integer NOT NULL,
  "verdict" varchar(40) NOT NULL,
  "strengths" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "gaps" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "feedback" text NOT NULL,
  "covered_signals" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "rubric" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "interview_answers_question_attempt_idx" ON "interview_answers" USING btree ("question_id","attempt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "interview_answers_session_idx" ON "interview_answers" USING btree ("session_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "interview_answers_question_idx" ON "interview_answers" USING btree ("question_id","attempt");
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'interview_answers_session_id_interview_sessions_id_fk') THEN
    ALTER TABLE "interview_answers"
      ADD CONSTRAINT "interview_answers_session_id_interview_sessions_id_fk"
      FOREIGN KEY ("session_id") REFERENCES "interview_sessions"("id") ON DELETE cascade;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'interview_answers_question_id_interview_questions_id_fk') THEN
    ALTER TABLE "interview_answers"
      ADD CONSTRAINT "interview_answers_question_id_interview_questions_id_fk"
      FOREIGN KEY ("question_id") REFERENCES "interview_questions"("id") ON DELETE cascade;
  END IF;
END $$;
