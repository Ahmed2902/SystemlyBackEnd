-- Multi-branch foundation.
--
-- This migration is intentionally backward compatible with the current
-- application/Prisma schema. Branch foreign keys on operational records stay
-- nullable until the application is branch-aware in the following PRs.

CREATE TABLE "branches" (
  "id" UUID NOT NULL,
  "business_id" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "slug" VARCHAR(120) NOT NULL,
  "phone" VARCHAR(30),
  "address" TEXT,
  "city" VARCHAR(120),
  "lat" DECIMAL(10,7),
  "lng" DECIMAL(10,7),
  "timezone" VARCHAR(80) NOT NULL DEFAULT 'Africa/Cairo',
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "branches_business_id_slug_key"
  ON "branches"("business_id", "slug");
CREATE INDEX "branches_business_id_is_active_idx"
  ON "branches"("business_id", "is_active");

ALTER TABLE "branches"
  ADD CONSTRAINT "branches_business_id_fkey"
  FOREIGN KEY ("business_id") REFERENCES "businesses"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Every existing business starts with exactly one compatibility branch. The
-- old Business location columns remain in place until all consumers migrate.
INSERT INTO "branches" (
  "id",
  "business_id",
  "name",
  "slug",
  "phone",
  "address",
  "city",
  "lat",
  "lng",
  "timezone",
  "is_active",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid(),
  business."id",
  'Main Branch',
  'main',
  business."phone",
  business."address",
  business."city",
  business."lat",
  business."lng",
  business."timezone",
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "businesses" AS business
WHERE NOT EXISTS (
  SELECT 1
  FROM "branches" AS existing_branch
  WHERE existing_branch."business_id" = business."id"
);

ALTER TABLE "staff"
  ADD COLUMN "branch_id" UUID;
ALTER TABLE "services"
  ADD COLUMN "branch_id" UUID;
ALTER TABLE "appointments"
  ADD COLUMN "branch_id" UUID;
ALTER TABLE "invoices"
  ADD COLUMN "branch_id" UUID;
ALTER TABLE "staff_invites"
  ADD COLUMN "branch_id" UUID;

-- Backfill all current operational data to the compatibility branch. Staff
-- invites are also assigned so outstanding invitations remain valid when the
-- branch-aware invitation flow lands.
UPDATE "staff" AS record
SET "branch_id" = branch."id"
FROM "branches" AS branch
WHERE branch."business_id" = record."business_id"
  AND branch."slug" = 'main'
  AND record."branch_id" IS NULL;

UPDATE "services" AS record
SET "branch_id" = branch."id"
FROM "branches" AS branch
WHERE branch."business_id" = record."business_id"
  AND branch."slug" = 'main'
  AND record."branch_id" IS NULL;

UPDATE "appointments" AS record
SET "branch_id" = branch."id"
FROM "branches" AS branch
WHERE branch."business_id" = record."business_id"
  AND branch."slug" = 'main'
  AND record."branch_id" IS NULL;

UPDATE "invoices" AS record
SET "branch_id" = branch."id"
FROM "branches" AS branch
WHERE branch."business_id" = record."business_id"
  AND branch."slug" = 'main'
  AND record."branch_id" IS NULL;

UPDATE "staff_invites" AS record
SET "branch_id" = branch."id"
FROM "branches" AS branch
WHERE branch."business_id" = record."business_id"
  AND branch."slug" = 'main'
  AND record."branch_id" IS NULL;

CREATE INDEX "staff_business_id_branch_id_idx"
  ON "staff"("business_id", "branch_id");
CREATE INDEX "services_business_id_branch_id_idx"
  ON "services"("business_id", "branch_id");
CREATE INDEX "appointments_business_id_branch_id_starts_at_idx"
  ON "appointments"("business_id", "branch_id", "starts_at");
CREATE INDEX "invoices_business_id_branch_id_issued_at_idx"
  ON "invoices"("business_id", "branch_id", "issued_at");
CREATE INDEX "staff_invites_business_id_branch_id_idx"
  ON "staff_invites"("business_id", "branch_id");

ALTER TABLE "staff"
  ADD CONSTRAINT "staff_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "services"
  ADD CONSTRAINT "services_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "staff_invites"
  ADD CONSTRAINT "staff_invites_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
