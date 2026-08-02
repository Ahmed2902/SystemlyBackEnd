CREATE TYPE "BillingInterval" AS ENUM ('MONTHLY');
CREATE TYPE "RenewalMode" AS ENUM ('MANUAL', 'AUTOMATIC');
CREATE TYPE "BillingProvider" AS ENUM ('EASYKASH');

ALTER TABLE "businesses"
  ADD COLUMN "trial_used_at" TIMESTAMP(3),
  ADD COLUMN "deleted_at" TIMESTAMP(3);

CREATE INDEX "businesses_deleted_at_idx" ON "businesses"("deleted_at");

ALTER TABLE "plans"
  ADD COLUMN "code" VARCHAR(50),
  ADD COLUMN "description" TEXT,
  ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "is_public" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0;

DO $$
DECLARE
  core_plan_id UUID;
BEGIN
  SELECT "id"
  INTO core_plan_id
  FROM "plans"
  WHERE "name" = 'Systemly Core'
  LIMIT 1;

  IF core_plan_id IS NULL THEN
    SELECT "id"
    INTO core_plan_id
    FROM "plans"
    WHERE "name" = 'Starter'
    LIMIT 1;
  END IF;

  IF core_plan_id IS NULL THEN
    INSERT INTO "plans" (
      "id",
      "code",
      "name",
      "description",
      "price_egp",
      "sms_reminders",
      "custom_domain",
      "is_active",
      "is_public",
      "sort_order",
      "created_at",
      "updated_at"
    )
    VALUES (
      gen_random_uuid(),
      'CORE',
      'Systemly Core',
      'The complete operating system for a service business.',
      799,
      false,
      false,
      true,
      true,
      10,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
    RETURNING "id" INTO core_plan_id;
  ELSE
    UPDATE "plans"
    SET
      "code" = 'CORE',
      "name" = 'Systemly Core',
      "description" = COALESCE(
        "description",
        'The complete operating system for a service business.'
      ),
      "price_egp" = 799,
      "is_active" = true,
      "is_public" = true,
      "sort_order" = 10,
      "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = core_plan_id;
  END IF;

  UPDATE "plans"
  SET "code" = 'LEGACY_' || REPLACE("id"::TEXT, '-', '')
  WHERE "code" IS NULL;
END $$;

ALTER TABLE "plans"
  ALTER COLUMN "code" SET NOT NULL;

CREATE UNIQUE INDEX "plans_code_key" ON "plans"("code");
CREATE INDEX "plans_is_active_is_public_sort_order_idx"
  ON "plans"("is_active", "is_public", "sort_order");

CREATE TABLE "plan_prices" (
  "id" UUID NOT NULL,
  "plan_id" UUID NOT NULL,
  "amount_cents" INTEGER NOT NULL,
  "currency" VARCHAR(10) NOT NULL DEFAULT 'EGP',
  "interval" "BillingInterval" NOT NULL DEFAULT 'MONTHLY',
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "plan_prices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "plan_prices_plan_id_amount_cents_currency_interval_key"
  ON "plan_prices"("plan_id", "amount_cents", "currency", "interval");
CREATE INDEX "plan_prices_plan_id_is_active_idx"
  ON "plan_prices"("plan_id", "is_active");
ALTER TABLE "plan_prices"
  ADD CONSTRAINT "plan_prices_plan_id_fkey"
  FOREIGN KEY ("plan_id") REFERENCES "plans"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "plan_entitlements" (
  "id" UUID NOT NULL,
  "plan_id" UUID NOT NULL,
  "key" VARCHAR(80) NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "limit" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "plan_entitlements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "plan_entitlements_plan_id_key_key"
  ON "plan_entitlements"("plan_id", "key");
CREATE INDEX "plan_entitlements_plan_id_enabled_idx"
  ON "plan_entitlements"("plan_id", "enabled");
ALTER TABLE "plan_entitlements"
  ADD CONSTRAINT "plan_entitlements_plan_id_fkey"
  FOREIGN KEY ("plan_id") REFERENCES "plans"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "subscriptions"
  ADD COLUMN "price_id" UUID,
  ADD COLUMN "renewal_mode" "RenewalMode" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "trial_started_at" TIMESTAMP(3),
  ADD COLUMN "trial_ends_at" TIMESTAMP(3),
  ADD COLUMN "grace_ends_at" TIMESTAMP(3),
  ADD COLUMN "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canceled_at" TIMESTAMP(3),
  ADD COLUMN "ended_at" TIMESTAMP(3),
  ADD COLUMN "provider" "BillingProvider",
  ADD COLUMN "provider_customer_id" VARCHAR(255),
  ADD COLUMN "provider_subscription_id" VARCHAR(255),
  ADD COLUMN "provider_payment_method_id" VARCHAR(255);

CREATE INDEX "subscriptions_price_id_idx" ON "subscriptions"("price_id");
CREATE INDEX "subscriptions_status_current_period_end_idx"
  ON "subscriptions"("status", "current_period_end");
ALTER TABLE "subscriptions"
  ADD CONSTRAINT "subscriptions_price_id_fkey"
  FOREIGN KEY ("price_id") REFERENCES "plan_prices"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "plan_prices" (
  "id",
  "plan_id",
  "amount_cents",
  "currency",
  "interval",
  "is_active",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid(),
  "id",
  79900,
  'EGP',
  'MONTHLY'::"BillingInterval",
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "plans"
WHERE "code" = 'CORE'
ON CONFLICT ("plan_id", "amount_cents", "currency", "interval")
DO UPDATE SET
  "is_active" = true,
  "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "plan_entitlements" (
  "id",
  "plan_id",
  "key",
  "enabled",
  "limit",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid(),
  plan_row."id",
  entitlement."key",
  true,
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "plans" AS plan_row
CROSS JOIN (
  VALUES
    ('PUBLIC_WEBSITE'),
    ('ONLINE_BOOKING'),
    ('OPERATIONS_CALENDAR'),
    ('CUSTOMER_CRM'),
    ('STAFF_AND_SERVICES'),
    ('INVOICES'),
    ('OWNER_ANALYTICS'),
    ('EMAIL_REMINDERS'),
    ('CLINIC_RECORDS')
) AS entitlement("key")
WHERE plan_row."code" = 'CORE'
ON CONFLICT ("plan_id", "key")
DO UPDATE SET
  "enabled" = true,
  "limit" = NULL,
  "updated_at" = CURRENT_TIMESTAMP;
