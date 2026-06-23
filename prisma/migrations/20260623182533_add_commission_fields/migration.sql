/*
  Warnings:

  - A unique constraint covering the columns `[appointment_id]` on the table `invoices` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "CommissionType" AS ENUM ('NONE', 'FLAT', 'PERCENT');

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "appointment_id" UUID;

-- AlterTable
ALTER TABLE "photos" ADD COLUMN     "public_id" VARCHAR(255);

-- AlterTable
ALTER TABLE "service_staff" ADD COLUMN     "commission_amount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "commission_type" "CommissionType" NOT NULL DEFAULT 'NONE';

-- CreateTable
CREATE TABLE "loyalty_accounts" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "points_balance" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loyalty_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_transactions" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "invoice_id" UUID,
    "points" INTEGER NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loyalty_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "loyalty_accounts_business_id_idx" ON "loyalty_accounts"("business_id");

-- CreateIndex
CREATE UNIQUE INDEX "loyalty_accounts_customer_id_business_id_key" ON "loyalty_accounts"("customer_id", "business_id");

-- CreateIndex
CREATE INDEX "loyalty_transactions_account_id_idx" ON "loyalty_transactions"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_appointment_id_key" ON "invoices"("appointment_id");

-- AddForeignKey
ALTER TABLE "loyalty_accounts" ADD CONSTRAINT "loyalty_accounts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_accounts" ADD CONSTRAINT "loyalty_accounts_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "loyalty_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
