-- Immediate-payment invoice workflow for V1.
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'BANK_TRANSFER', 'MOBILE_WALLET');

-- Existing price_cents becomes the unit-price snapshot; quantity is new.
ALTER TABLE "appointment_custom_items"
  ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "appointment_custom_items"
  ADD CONSTRAINT "appointment_custom_items_quantity_check" CHECK ("quantity" > 0);
ALTER TABLE "appointment_custom_items"
  ADD CONSTRAINT "appointment_custom_items_price_check" CHECK ("price_cents" >= 0);

-- Allow a voided invoice to remain in history while a replacement invoice is collected.
DROP INDEX IF EXISTS "invoices_appointment_id_key";
CREATE INDEX "invoices_appointment_id_idx" ON "invoices"("appointment_id");

ALTER TABLE "invoices"
  ADD COLUMN "payment_method" "PaymentMethod",
  ADD COLUMN "payment_reference" VARCHAR(255),
  ADD COLUMN "paid_by_user_id" UUID,
  ADD COLUMN "voided_by_user_id" UUID,
  ADD COLUMN "void_reason" TEXT;

ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_paid_by_user_id_fkey"
  FOREIGN KEY ("paid_by_user_id") REFERENCES "business_users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_voided_by_user_id_fkey"
  FOREIGN KEY ("voided_by_user_id") REFERENCES "business_users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "invoices_business_id_status_issued_at_idx"
  ON "invoices"("business_id", "status", "issued_at");
CREATE INDEX "invoices_payment_method_idx" ON "invoices"("payment_method");

-- Atomic yearly invoice number allocation per business.
CREATE TABLE "invoice_counters" (
  "business_id" UUID NOT NULL,
  "year" INTEGER NOT NULL,
  "last_number" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "invoice_counters_pkey" PRIMARY KEY ("business_id", "year"),
  CONSTRAINT "invoice_counters_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "businesses"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
