-- The preceding migration removes this legacy column on a clean database.
-- Keep this duplicate cleanup safe for databases where it was already removed.
ALTER TABLE "subscriptions"
  DROP COLUMN IF EXISTS "paymob_subscription_id";
