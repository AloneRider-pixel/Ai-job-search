ALTER TABLE "mailbox_connections" ADD COLUMN IF NOT EXISTS "next_sync_at" timestamptz;
--> statement-breakpoint
ALTER TABLE "mailbox_connections" ADD COLUMN IF NOT EXISTS "sync_failure_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "mailbox_connections" ADD COLUMN IF NOT EXISTS "sync_lease_until" timestamptz;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mailbox_connections_due_idx" ON "mailbox_connections" USING btree ("status","next_sync_at","sync_lease_until");
