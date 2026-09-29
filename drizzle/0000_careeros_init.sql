CREATE TABLE IF NOT EXISTS "profiles" (
  "id" serial PRIMARY KEY NOT NULL,
  "email" varchar(320),
  "name" varchar(160) NOT NULL,
  "headline" varchar(240),
  "summary" text,
  "location" varchar(160),
  "target_roles" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "target_locations" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "preferences" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "profiles_email_idx" ON "profiles" USING btree ("email");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "profile_experiences" (
  "id" serial PRIMARY KEY NOT NULL,
  "profile_id" integer NOT NULL,
  "title" varchar(180) NOT NULL,
  "company" varchar(180) NOT NULL,
  "start_date" timestamptz,
  "end_date" timestamptz,
  "bullets" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "technologies" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "profile_experience_profile_idx" ON "profile_experiences" USING btree ("profile_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "jobs" (
  "id" serial PRIMARY KEY NOT NULL,
  "source" varchar(80) NOT NULL,
  "external_id" varchar(240) NOT NULL,
  "title" varchar(240) NOT NULL,
  "company" varchar(240) NOT NULL,
  "location" varchar(240),
  "employment_type" varchar(80),
  "apply_url" text,
  "source_url" text,
  "description" text NOT NULL,
  "posted_at" timestamptz,
  "expires_at" timestamptz,
  "is_active" boolean DEFAULT true NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "jobs_source_external_idx" ON "jobs" USING btree ("source","external_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jobs_active_posted_idx" ON "jobs" USING btree ("is_active","posted_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "job_analyses" (
  "id" serial PRIMARY KEY NOT NULL,
  "job_id" integer NOT NULL,
  "profile_id" integer NOT NULL,
  "fit_score" integer NOT NULL,
  "confidence" integer NOT NULL,
  "hard_requirements" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "strengths" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "gaps" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "blockers" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "recommendation" varchar(40) NOT NULL,
  "model" varchar(160),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "job_analyses_job_profile_idx" ON "job_analyses" USING btree ("job_id","profile_id");
CREATE INDEX IF NOT EXISTS "job_analyses_profile_score_idx" ON "job_analyses" USING btree ("profile_id","fit_score");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "application_packages" (
  "id" serial PRIMARY KEY NOT NULL,
  "profile_id" integer NOT NULL,
  "job_id" integer NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "status" varchar(40) DEFAULT 'draft' NOT NULL,
  "fit_score" integer,
  "resume_text" text,
  "resume_file_url" text,
  "cover_letter" text,
  "outreach_draft" text,
  "requirement_matrix" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "learning_plan" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "next_actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "provenance" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "application_packages_job_profile_version_idx" ON "application_packages" USING btree ("job_id","profile_id","version");
CREATE INDEX IF NOT EXISTS "application_packages_profile_status_idx" ON "application_packages" USING btree ("profile_id","status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "applications" (
  "id" serial PRIMARY KEY NOT NULL,
  "profile_id" integer NOT NULL,
  "job_id" integer NOT NULL,
  "package_id" integer,
  "stage" varchar(40) DEFAULT 'wishlist' NOT NULL,
  "applied_at" timestamptz,
  "next_action" text,
  "next_action_at" timestamptz,
  "notes" text,
  "outcome" varchar(80),
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "applications_profile_job_idx" ON "applications" USING btree ("profile_id","job_id");
CREATE INDEX IF NOT EXISTS "applications_profile_stage_idx" ON "applications" USING btree ("profile_id","stage");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "recruiter_contacts" (
  "id" serial PRIMARY KEY NOT NULL,
  "company" varchar(240) NOT NULL,
  "name" varchar(180),
  "role" varchar(180),
  "profile_url" text,
  "email" varchar(320),
  "source" varchar(120),
  "verification_state" varchar(40) DEFAULT 'unverified' NOT NULL,
  "confidence" integer DEFAULT 0 NOT NULL,
  "last_verified_at" timestamptz,
  "evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recruiter_contacts_company_idx" ON "recruiter_contacts" USING btree ("company");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "outreach_messages" (
  "id" serial PRIMARY KEY NOT NULL,
  "profile_id" integer NOT NULL,
  "application_id" integer,
  "contact_id" integer,
  "channel" varchar(40) NOT NULL,
  "status" varchar(40) DEFAULT 'draft' NOT NULL,
  "subject" text,
  "body" text NOT NULL,
  "provider_message_id" varchar(320),
  "sent_at" timestamptz,
  "reply_at" timestamptz,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outreach_messages_application_idx" ON "outreach_messages" USING btree ("application_id");
CREATE INDEX IF NOT EXISTS "outreach_messages_profile_status_idx" ON "outreach_messages" USING btree ("profile_id","status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "learning_tasks" (
  "id" serial PRIMARY KEY NOT NULL,
  "profile_id" integer NOT NULL,
  "job_id" integer,
  "skill" varchar(160) NOT NULL,
  "priority" integer DEFAULT 50 NOT NULL,
  "status" varchar(40) DEFAULT 'planned' NOT NULL,
  "resource_url" text,
  "practice_task" text,
  "mastery_score" integer DEFAULT 0 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "learning_tasks_profile_status_idx" ON "learning_tasks" USING btree ("profile_id","status");
--> statement-breakpoint
ALTER TABLE "profile_experiences" ADD CONSTRAINT "profile_experiences_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "job_analyses" ADD CONSTRAINT "job_analyses_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "job_analyses" ADD CONSTRAINT "job_analyses_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "application_packages" ADD CONSTRAINT "application_packages_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "application_packages" ADD CONSTRAINT "application_packages_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_package_id_application_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "application_packages"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "outreach_messages" ADD CONSTRAINT "outreach_messages_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "outreach_messages" ADD CONSTRAINT "outreach_messages_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "outreach_messages" ADD CONSTRAINT "outreach_messages_contact_id_recruiter_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "recruiter_contacts"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "learning_tasks" ADD CONSTRAINT "learning_tasks_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE cascade;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS profiles_updated_at ON profiles;
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS profile_experiences_updated_at ON profile_experiences;
CREATE TRIGGER profile_experiences_updated_at BEFORE UPDATE ON profile_experiences FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS jobs_updated_at ON jobs;
CREATE TRIGGER jobs_updated_at BEFORE UPDATE ON jobs FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS job_analyses_updated_at ON job_analyses;
CREATE TRIGGER job_analyses_updated_at BEFORE UPDATE ON job_analyses FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS application_packages_updated_at ON application_packages;
CREATE TRIGGER application_packages_updated_at BEFORE UPDATE ON application_packages FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS applications_updated_at ON applications;
CREATE TRIGGER applications_updated_at BEFORE UPDATE ON applications FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS recruiter_contacts_updated_at ON recruiter_contacts;
CREATE TRIGGER recruiter_contacts_updated_at BEFORE UPDATE ON recruiter_contacts FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS outreach_messages_updated_at ON outreach_messages;
CREATE TRIGGER outreach_messages_updated_at BEFORE UPDATE ON outreach_messages FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS learning_tasks_updated_at ON learning_tasks;
CREATE TRIGGER learning_tasks_updated_at BEFORE UPDATE ON learning_tasks FOR EACH ROW EXECUTE FUNCTION set_updated_at();
