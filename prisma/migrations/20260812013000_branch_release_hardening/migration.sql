-- Finalize operational branch ownership before exposing multi-branch to V1 customers.

-- Appointment-backed invoices inherit the visit branch first.
UPDATE "invoices" AS invoice
SET "branch_id" = appointment."branch_id"
FROM "appointments" AS appointment
WHERE invoice."appointment_id" = appointment."id"
  AND invoice."branch_id" IS NULL
  AND appointment."branch_id" IS NOT NULL;

-- Repair any transitional null branch ids using the compatibility/oldest
-- branch created for the business by the foundation migration.
UPDATE "staff" AS record
SET "branch_id" = (
  SELECT branch."id"
  FROM "branches" AS branch
  WHERE branch."business_id" = record."business_id"
  ORDER BY (branch."slug" = 'main') DESC, branch."created_at" ASC
  LIMIT 1
)
WHERE record."branch_id" IS NULL;

UPDATE "services" AS record
SET "branch_id" = (
  SELECT branch."id"
  FROM "branches" AS branch
  WHERE branch."business_id" = record."business_id"
  ORDER BY (branch."slug" = 'main') DESC, branch."created_at" ASC
  LIMIT 1
)
WHERE record."branch_id" IS NULL;

UPDATE "appointments" AS record
SET "branch_id" = (
  SELECT branch."id"
  FROM "branches" AS branch
  WHERE branch."business_id" = record."business_id"
  ORDER BY (branch."slug" = 'main') DESC, branch."created_at" ASC
  LIMIT 1
)
WHERE record."branch_id" IS NULL;

UPDATE "invoices" AS record
SET "branch_id" = (
  SELECT branch."id"
  FROM "branches" AS branch
  WHERE branch."business_id" = record."business_id"
  ORDER BY (branch."slug" = 'main') DESC, branch."created_at" ASC
  LIMIT 1
)
WHERE record."branch_id" IS NULL;

UPDATE "staff_invites" AS record
SET "branch_id" = (
  SELECT branch."id"
  FROM "branches" AS branch
  WHERE branch."business_id" = record."business_id"
  ORDER BY (branch."slug" = 'main') DESC, branch."created_at" ASC
  LIMIT 1
)
WHERE record."branch_id" IS NULL;

-- Systemly V1 is Egypt-only. Keep compatibility Business timezone fields and
-- the branch source of truth aligned while old reads are phased out.
UPDATE "branches"
SET "timezone" = 'Africa/Cairo'
WHERE "timezone" <> 'Africa/Cairo';

UPDATE "businesses"
SET "timezone" = 'Africa/Cairo'
WHERE "timezone" <> 'Africa/Cairo';

ALTER TABLE "staff" ALTER COLUMN "branch_id" SET NOT NULL;
ALTER TABLE "services" ALTER COLUMN "branch_id" SET NOT NULL;
ALTER TABLE "appointments" ALTER COLUMN "branch_id" SET NOT NULL;
ALTER TABLE "invoices" ALTER COLUMN "branch_id" SET NOT NULL;
ALTER TABLE "staff_invites" ALTER COLUMN "branch_id" SET NOT NULL;
