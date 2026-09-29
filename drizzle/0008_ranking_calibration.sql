CREATE TABLE IF NOT EXISTS "ranking_calibrations" (
  "id" serial PRIMARY KEY NOT NULL,
  "profile_id" integer NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "sample_count" integer DEFAULT 0 NOT NULL,
  "baseline" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "feature_stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "interactions" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "methodology" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "trained_at" timestamptz DEFAULT now() NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ranking_calibrations_profile_id_profiles_id_fk') THEN
    ALTER TABLE "ranking_calibrations"
      ADD CONSTRAINT "ranking_calibrations_profile_id_profiles_id_fk"
      FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE cascade;
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ranking_calibrations_profile_idx" ON "ranking_calibrations" USING btree ("profile_id");
