ALTER TABLE "recruiter_contacts" ADD COLUMN IF NOT EXISTS "job_id" integer;
--> statement-breakpoint
ALTER TABLE "recruiter_contacts" ADD COLUMN IF NOT EXISTS "provider_person_id" varchar(160);
--> statement-breakpoint
ALTER TABLE "recruiter_contacts" ADD COLUMN IF NOT EXISTS "approval_state" varchar(40) DEFAULT 'candidate' NOT NULL;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recruiter_contacts_job_id_jobs_id_fk') THEN
    ALTER TABLE "recruiter_contacts"
      ADD CONSTRAINT "recruiter_contacts_job_id_jobs_id_fk"
      FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE set null;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recruiter_contacts_profile_job_idx" ON "recruiter_contacts" USING btree ("profile_id","job_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recruiter_contacts_provider_person_idx" ON "recruiter_contacts" USING btree ("source","provider_person_id");
