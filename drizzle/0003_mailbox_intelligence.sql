ALTER TABLE "recruiter_contacts" ADD COLUMN IF NOT EXISTS "profile_id" integer;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recruiter_contacts_profile_id_profiles_id_fk') THEN
    ALTER TABLE "recruiter_contacts"
      ADD CONSTRAINT "recruiter_contacts_profile_id_profiles_id_fk"
      FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE cascade;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recruiter_contacts_profile_idx" ON "recruiter_contacts" USING btree ("profile_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mailbox_connections" (
  "id" serial PRIMARY KEY NOT NULL,
  "profile_id" integer NOT NULL,
  "provider" varchar(40) NOT NULL,
  "provider_account_id" varchar(320) NOT NULL,
  "account_email" varchar(320) NOT NULL,
  "access_token_encrypted" text NOT NULL,
  "refresh_token_encrypted" text,
  "token_expires_at" timestamptz,
  "scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "sync_cursor" text,
  "last_sync_at" timestamptz,
  "status" varchar(40) DEFAULT 'connected' NOT NULL,
  "last_error" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mailbox_connections_profile_provider_account_idx" ON "mailbox_connections" USING btree ("profile_id","provider","provider_account_id");
CREATE INDEX IF NOT EXISTS "mailbox_connections_profile_idx" ON "mailbox_connections" USING btree ("profile_id");
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mailbox_connections_profile_id_profiles_id_fk') THEN
    ALTER TABLE "mailbox_connections"
      ADD CONSTRAINT "mailbox_connections_profile_id_profiles_id_fk"
      FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE cascade;
  END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "oauth_states" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "provider" varchar(40) NOT NULL,
  "state_hash" varchar(64) NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "oauth_states_hash_idx" ON "oauth_states" USING btree ("state_hash");
CREATE INDEX IF NOT EXISTS "oauth_states_user_idx" ON "oauth_states" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "oauth_states_expiry_idx" ON "oauth_states" USING btree ("expires_at");
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'oauth_states_user_id_users_id_fk') THEN
    ALTER TABLE "oauth_states"
      ADD CONSTRAINT "oauth_states_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade;
  END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_messages" (
  "id" serial PRIMARY KEY NOT NULL,
  "profile_id" integer NOT NULL,
  "connection_id" integer NOT NULL,
  "provider_message_id" varchar(320) NOT NULL,
  "thread_id" varchar(320),
  "direction" varchar(20) NOT NULL,
  "subject" text,
  "from_email" varchar(320),
  "to_emails" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "received_at" timestamptz,
  "sent_at" timestamptz,
  "snippet" text,
  "body_text" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "email_messages_connection_provider_id_idx" ON "email_messages" USING btree ("connection_id","provider_message_id");
CREATE INDEX IF NOT EXISTS "email_messages_profile_received_idx" ON "email_messages" USING btree ("profile_id","received_at");
CREATE INDEX IF NOT EXISTS "email_messages_profile_thread_idx" ON "email_messages" USING btree ("profile_id","thread_id");
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_messages_profile_id_profiles_id_fk') THEN
    ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_profile_id_profiles_id_fk"
      FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE cascade;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_messages_connection_id_mailbox_connections_id_fk') THEN
    ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_connection_id_mailbox_connections_id_fk"
      FOREIGN KEY ("connection_id") REFERENCES "mailbox_connections"("id") ON DELETE cascade;
  END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "application_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "profile_id" integer NOT NULL,
  "application_id" integer,
  "message_id" integer NOT NULL,
  "event_type" varchar(60) NOT NULL,
  "confidence" integer NOT NULL,
  "evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "occurred_at" timestamptz NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "application_events_message_type_idx" ON "application_events" USING btree ("message_id","event_type");
CREATE INDEX IF NOT EXISTS "application_events_profile_time_idx" ON "application_events" USING btree ("profile_id","occurred_at");
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'application_events_profile_id_profiles_id_fk') THEN
    ALTER TABLE "application_events" ADD CONSTRAINT "application_events_profile_id_profiles_id_fk"
      FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE cascade;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'application_events_application_id_applications_id_fk') THEN
    ALTER TABLE "application_events" ADD CONSTRAINT "application_events_application_id_applications_id_fk"
      FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE set null;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'application_events_message_id_email_messages_id_fk') THEN
    ALTER TABLE "application_events" ADD CONSTRAINT "application_events_message_id_email_messages_id_fk"
      FOREIGN KEY ("message_id") REFERENCES "email_messages"("id") ON DELETE cascade;
  END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "outreach_sequences" (
  "id" serial PRIMARY KEY NOT NULL,
  "profile_id" integer NOT NULL,
  "application_id" integer,
  "status" varchar(40) DEFAULT 'draft' NOT NULL,
  "current_step" integer DEFAULT 0 NOT NULL,
  "next_action_at" timestamptz,
  "stop_reason" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "outreach_sequences_profile_application_idx" ON "outreach_sequences" USING btree ("profile_id","application_id");
CREATE INDEX IF NOT EXISTS "outreach_sequences_due_idx" ON "outreach_sequences" USING btree ("status","next_action_at");
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'outreach_sequences_profile_id_profiles_id_fk') THEN
    ALTER TABLE "outreach_sequences" ADD CONSTRAINT "outreach_sequences_profile_id_profiles_id_fk"
      FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE cascade;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'outreach_sequences_application_id_applications_id_fk') THEN
    ALTER TABLE "outreach_sequences" ADD CONSTRAINT "outreach_sequences_application_id_applications_id_fk"
      FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE cascade;
  END IF;
END $$;
