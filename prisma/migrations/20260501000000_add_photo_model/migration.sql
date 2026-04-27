-- Create photos table for gallery
CREATE TABLE IF NOT EXISTS "photos" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "business_id" uuid NOT NULL,
  "url" text NOT NULL,
  "public_id" varchar(255) NOT NULL,
  "caption" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "photos_business_id_idx" ON "photos" ("business_id");

ALTER TABLE "photos"
  ADD CONSTRAINT IF NOT EXISTS "photos_business_id_fkey"
  FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE;
