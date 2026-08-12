-- Reattach receptionist accounts created before branch scope was enforced.
-- The accepted invitation is the source of truth for their assigned branch.
WITH accepted_invites AS (
  SELECT DISTINCT ON ("business_id", "email")
    "business_id",
    "email",
    "branch_id"
  FROM "staff_invites"
  WHERE "accepted_at" IS NOT NULL
    AND "role" = 'Receptionist'
    AND "branch_id" IS NOT NULL
  ORDER BY "business_id", "email", "accepted_at" DESC
)
UPDATE "business_users" AS user_record
SET "branch_id" = invite."branch_id"
FROM accepted_invites AS invite
WHERE user_record."business_id" = invite."business_id"
  AND user_record."email" = invite."email"
  AND user_record."role" = 'Receptionist'
  AND user_record."branch_id" IS NULL;

-- Keep owner accounts branch-agnostic while making branch assignment mandatory
-- for receptionist accounts created or updated after this migration.
ALTER TABLE "business_users"
  ADD CONSTRAINT "business_users_receptionist_branch_required"
  CHECK ("role" <> 'Receptionist' OR "branch_id" IS NOT NULL)
  NOT VALID;
