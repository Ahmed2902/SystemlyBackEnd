-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "eta_receipt_uid" VARCHAR(255),
ADD COLUMN     "eta_submitted_at" TIMESTAMP(3);
