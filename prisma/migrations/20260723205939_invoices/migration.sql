-- AlterTable
ALTER TABLE "invoice_counters" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "invoices" ALTER COLUMN "status" SET DEFAULT 'paid';
