CREATE TYPE "SubscriptionPaymentStatus" AS ENUM (
  'PENDING',
  'REQUIRES_ACTION',
  'SUCCEEDED',
  'FAILED',
  'EXPIRED',
  'CANCELED',
  'REFUNDED'
);

CREATE TABLE "subscription_payments" (
  "id" UUID NOT NULL,
  "subscription_id" UUID NOT NULL,
  "plan_id" UUID NOT NULL,
  "price_id" UUID NOT NULL,
  "provider" "BillingProvider" NOT NULL,
  "status" "SubscriptionPaymentStatus" NOT NULL DEFAULT 'PENDING',
  "amount_cents" INTEGER NOT NULL,
  "currency" VARCHAR(10) NOT NULL,
  "provider_checkout_id" VARCHAR(255),
  "provider_payment_id" VARCHAR(255),
  "checkout_url" TEXT,
  "failure_code" VARCHAR(120),
  "failure_reason" TEXT,
  "paid_at" TIMESTAMP(3),
  "failed_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "subscription_payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "subscription_payments_subscription_id_fkey"
    FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "subscription_payments_plan_id_fkey"
    FOREIGN KEY ("plan_id") REFERENCES "plans"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "subscription_payments_price_id_fkey"
    FOREIGN KEY ("price_id") REFERENCES "plan_prices"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "subscription_payments_subscription_id_created_at_idx"
  ON "subscription_payments"("subscription_id", "created_at");
CREATE INDEX "subscription_payments_status_expires_at_idx"
  ON "subscription_payments"("status", "expires_at");
CREATE UNIQUE INDEX "subscription_payments_provider_payment_id_key"
  ON "subscription_payments"("provider", "provider_payment_id");
CREATE UNIQUE INDEX "subscription_payments_one_open_checkout"
  ON "subscription_payments"("subscription_id", "plan_id")
  WHERE "status" IN ('PENDING', 'REQUIRES_ACTION');

CREATE TABLE "billing_webhook_events" (
  "id" UUID NOT NULL,
  "provider" "BillingProvider" NOT NULL,
  "provider_event_id" VARCHAR(255) NOT NULL,
  "event_type" VARCHAR(120),
  "payload" JSONB NOT NULL,
  "processed_at" TIMESTAMP(3),
  "processing_error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "billing_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "billing_webhook_events_provider_provider_event_id_key"
  ON "billing_webhook_events"("provider", "provider_event_id");
CREATE INDEX "billing_webhook_events_processed_at_idx"
  ON "billing_webhook_events"("processed_at");
