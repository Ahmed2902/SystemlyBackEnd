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

-- Preserve lifetime trial eligibility for every business that already has a
-- subscription, regardless of whether that subscription is trialing or paid.
UPDATE "businesses" AS business
SET "trial_used_at" = COALESCE(
  business."trial_used_at",
  subscription."trial_started_at",
  subscription."current_period_start",
  subscription."created_at"
)
FROM "subscriptions" AS subscription
WHERE
  subscription."business_id" = business."id"
  AND business."trial_used_at" IS NULL;

-- Existing active businesses predate the subscription system. Give each one
-- the same one-time 14-day Core trial at deployment so access enforcement does
-- not unexpectedly lock current data or development tenants.
INSERT INTO "subscriptions" (
  "id",
  "business_id",
  "plan_id",
  "price_id",
  "status",
  "renewal_mode",
  "trial_started_at",
  "trial_ends_at",
  "current_period_start",
  "current_period_end",
  "cancel_at_period_end",
  "trial_notified_3days",
  "trial_notified_1day",
  "expired_handled",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid(),
  business."id",
  core_plan."id",
  NULL,
  'TRIALING'::"SubscriptionStatus",
  'MANUAL'::"RenewalMode",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP + INTERVAL '14 days',
  NULL,
  NULL,
  false,
  false,
  false,
  false,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "businesses" AS business
CROSS JOIN LATERAL (
  SELECT "id"
  FROM "plans"
  WHERE "code" = 'CORE'
  LIMIT 1
) AS core_plan
WHERE
  business."deleted_at" IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "subscriptions" AS subscription
    WHERE subscription."business_id" = business."id"
  );

UPDATE "businesses" AS business
SET "trial_used_at" = subscription."trial_started_at"
FROM "subscriptions" AS subscription
WHERE
  subscription."business_id" = business."id"
  AND subscription."status" = 'TRIALING'
  AND business."trial_used_at" IS NULL;
