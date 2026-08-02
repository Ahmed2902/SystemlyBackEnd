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
  p."id",
  ROUND(p."price_egp" * 100)::INTEGER,
  'EGP',
  'MONTHLY'::"BillingInterval",
  TRUE,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "plans" p
WHERE NOT EXISTS (
  SELECT 1
  FROM "plan_prices" pp
  WHERE pp."plan_id" = p."id"
    AND pp."currency" = 'EGP'
    AND pp."interval" = 'MONTHLY'::"BillingInterval"
);

ALTER TABLE "plans"
  DROP COLUMN "price_egp",
  DROP COLUMN "max_staff",
  DROP COLUMN "max_bookings_per_month",
  DROP COLUMN "sms_reminders",
  DROP COLUMN "custom_domain";
