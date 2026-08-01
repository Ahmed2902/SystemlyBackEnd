CREATE TYPE "SubscriptionStatus" AS ENUM (
  'TRIALING',
  'ACTIVE',
  'PAST_DUE',
  'EXPIRED',
  'CANCELED',
  'SUSPENDED',
  'INCOMPLETE'
);

ALTER TABLE "subscriptions"
  ALTER COLUMN "current_period_start" DROP NOT NULL,
  ALTER COLUMN "current_period_end" DROP NOT NULL;

ALTER TABLE "subscriptions"
  ALTER COLUMN "status" TYPE "SubscriptionStatus"
  USING (
    CASE LOWER("status")
      WHEN 'trialing' THEN 'TRIALING'
      WHEN 'active' THEN 'ACTIVE'
      WHEN 'past_due' THEN 'PAST_DUE'
      WHEN 'past-due' THEN 'PAST_DUE'
      WHEN 'expired' THEN 'EXPIRED'
      WHEN 'cancelled' THEN 'CANCELED'
      WHEN 'canceled' THEN 'CANCELED'
      WHEN 'suspended' THEN 'SUSPENDED'
      WHEN 'pending' THEN 'INCOMPLETE'
      WHEN 'incomplete' THEN 'INCOMPLETE'
      ELSE 'INCOMPLETE'
    END
  )::"SubscriptionStatus";

UPDATE "subscriptions"
SET
  "trial_started_at" = COALESCE("trial_started_at", "current_period_start"),
  "trial_ends_at" = COALESCE("trial_ends_at", "current_period_end"),
  "current_period_start" = NULL,
  "current_period_end" = NULL
WHERE "status" = 'TRIALING';

UPDATE "subscriptions"
SET
  "current_period_start" = NULL,
  "current_period_end" = NULL
WHERE "status" = 'INCOMPLETE';
