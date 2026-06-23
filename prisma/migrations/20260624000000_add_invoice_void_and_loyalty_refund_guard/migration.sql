-- Add refund/void tracking to invoices
ALTER TABLE "invoices"
ADD COLUMN "voided_at" TIMESTAMP(3);

-- Prevent duplicate loyalty credits/refunds for the same invoice and transaction type
CREATE UNIQUE INDEX "loyalty_transactions_invoice_id_type_key"
ON "loyalty_transactions"("invoice_id", "type");
