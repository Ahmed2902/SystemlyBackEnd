/*
  Warnings:

  - The values [overdue] on the enum `InvoiceStatus` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `due_at` on the `invoices` table. All the data in the column will be lost.
  - Made the column `vertical` on table `businesses` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "InvoiceStatus_new" AS ENUM ('draft', 'sent', 'paid', 'voided');
ALTER TABLE "public"."invoices" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "invoices" ALTER COLUMN "status" TYPE "InvoiceStatus_new" USING ("status"::text::"InvoiceStatus_new");
ALTER TYPE "InvoiceStatus" RENAME TO "InvoiceStatus_old";
ALTER TYPE "InvoiceStatus_new" RENAME TO "InvoiceStatus";
DROP TYPE "public"."InvoiceStatus_old";
ALTER TABLE "invoices" ALTER COLUMN "status" SET DEFAULT 'draft';
COMMIT;

-- AlterTable
ALTER TABLE "appointments" ALTER COLUMN "updated_at" DROP NOT NULL;

-- AlterTable
ALTER TABLE "businesses" ALTER COLUMN "vertical" SET NOT NULL;

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "acquisition_source" TEXT;

-- AlterTable
ALTER TABLE "invoice_line_items" ADD COLUMN     "commission_amount" INTEGER,
ADD COLUMN     "commission_earned_cents" INTEGER DEFAULT 0,
ADD COLUMN     "commission_type" "CommissionType",
ADD COLUMN     "staff_id" UUID;

-- AlterTable
ALTER TABLE "invoices" DROP COLUMN "due_at";

-- AlterTable
ALTER TABLE "photos" ADD COLUMN     "type" VARCHAR(30);

-- AlterTable
ALTER TABLE "services" ADD COLUMN     "category" VARCHAR(80);

-- CreateTable
CREATE TABLE "appointment_photos" (
    "id" UUID NOT NULL,
    "appointment_id" UUID NOT NULL,
    "photo_id" UUID NOT NULL,
    "type" VARCHAR(10) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointment_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinic_visit_records" (
    "id" UUID NOT NULL,
    "appointment_id" UUID NOT NULL,
    "notes" TEXT,
    "diagnosis" TEXT,
    "prescription_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinic_visit_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurance_claims" (
    "id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "insurer_name" VARCHAR(255) NOT NULL,
    "status" VARCHAR(50) NOT NULL,
    "claim_ref" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insurance_claims_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "appointment_photos_appointment_id_idx" ON "appointment_photos"("appointment_id");

-- CreateIndex
CREATE UNIQUE INDEX "clinic_visit_records_appointment_id_key" ON "clinic_visit_records"("appointment_id");

-- CreateIndex
CREATE UNIQUE INDEX "insurance_claims_invoice_id_key" ON "insurance_claims"("invoice_id");

-- CreateIndex
CREATE INDEX "insurance_claims_invoice_id_idx" ON "insurance_claims"("invoice_id");

-- CreateIndex
CREATE INDEX "customers_business_id_acquisition_source_idx" ON "customers"("business_id", "acquisition_source");

-- CreateIndex
CREATE INDEX "invoice_line_items_staff_id_idx" ON "invoice_line_items"("staff_id");

-- CreateIndex
CREATE INDEX "services_business_id_category_idx" ON "services"("business_id", "category");

-- AddForeignKey
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_photos" ADD CONSTRAINT "appointment_photos_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_photos" ADD CONSTRAINT "appointment_photos_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "photos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_visit_records" ADD CONSTRAINT "clinic_visit_records_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_claims" ADD CONSTRAINT "insurance_claims_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
