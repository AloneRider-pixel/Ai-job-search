CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint
ALTER TABLE "resume_documents" ADD COLUMN IF NOT EXISTS "mime_type" varchar(160) DEFAULT 'text/plain';
--> statement-breakpoint
ALTER TABLE "resume_documents" ADD COLUMN IF NOT EXISTS "file_hash" varchar(64);
--> statement-breakpoint
UPDATE "resume_documents"
SET "mime_type" = COALESCE("mime_type",'text/plain'),
    "file_hash" = COALESCE("file_hash", encode(digest(convert_to("raw_text",'UTF8'),'sha256'),'hex'))
WHERE "file_hash" IS NULL OR "mime_type" IS NULL;
--> statement-breakpoint
ALTER TABLE "resume_documents" ALTER COLUMN "file_hash" SET NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "resume_documents_profile_hash_idx" ON "resume_documents" USING btree ("profile_id","file_hash");
