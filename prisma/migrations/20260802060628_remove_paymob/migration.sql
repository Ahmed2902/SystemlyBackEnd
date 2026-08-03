-- A prior migration already removes this legacy column on a clean database.
-- Keep this migration as an idempotent compatibility step for environments
-- where the earlier cleanup was not applied consistently.
ALTER TABLE "subscriptions"
  DROP COLUMN IF EXISTS "paymob_subscription_id";
