CREATE TABLE IF NOT EXISTS "application_stage_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "profile_id" integer NOT NULL,
  "application_id" integer NOT NULL,
  "from_stage" varchar(40),
  "to_stage" varchar(40) NOT NULL,
  "source" varchar(40) DEFAULT 'user' NOT NULL,
  "occurred_at" timestamptz DEFAULT now() NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "application_stage_events_profile_idx" ON "application_stage_events" USING btree ("profile_id","occurred_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "application_stage_events_application_idx" ON "application_stage_events" USING btree ("application_id","occurred_at");
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'application_stage_events_profile_id_profiles_id_fk') THEN
    ALTER TABLE "application_stage_events"
      ADD CONSTRAINT "application_stage_events_profile_id_profiles_id_fk"
      FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE cascade;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'application_stage_events_application_id_applications_id_fk') THEN
    ALTER TABLE "application_stage_events"
      ADD CONSTRAINT "application_stage_events_application_id_applications_id_fk"
      FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE cascade;
  END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "outcome_learning_models" (
  "id" serial PRIMARY KEY NOT NULL,
  "profile_id" integer NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "sample_count" integer DEFAULT 0 NOT NULL,
  "baseline" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "feature_stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "trained_at" timestamptz DEFAULT now() NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'outcome_learning_models_profile_id_profiles_id_fk') THEN
    ALTER TABLE "outcome_learning_models"
      ADD CONSTRAINT "outcome_learning_models_profile_id_profiles_id_fk"
      FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE cascade;
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "outcome_learning_models_profile_idx" ON "outcome_learning_models" USING btree ("profile_id");
