-- CreateEnum
CREATE TYPE "StaffTimeOffType" AS ENUM ('VACATION', 'SICK', 'PERSONAL', 'OTHER');

-- AlterTable
ALTER TABLE "staff"
ADD COLUMN "job_title" VARCHAR(120),
ADD COLUMN "years_experience" INTEGER,
ADD COLUMN "bio" TEXT,
ADD COLUMN "phone" VARCHAR(30),
ADD COLUMN "email" VARCHAR(255);

-- Preserve existing whole-number commission values while allowing decimal percentages.
ALTER TABLE "service_staff"
ALTER COLUMN "commission_amount" TYPE DECIMAL(10, 2)
USING "commission_amount"::DECIMAL(10, 2);

ALTER TABLE "invoice_line_items"
ALTER COLUMN "commission_amount" TYPE DECIMAL(10, 2)
USING "commission_amount"::DECIMAL(10, 2);

-- CreateTable
CREATE TABLE "staff_time_off" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "staff_id" UUID NOT NULL,
  "business_id" UUID NOT NULL,
  "starts_on" DATE NOT NULL,
  "ends_on" DATE NOT NULL,
  "type" "StaffTimeOffType" NOT NULL DEFAULT 'VACATION',
  "label" VARCHAR(120),
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "staff_time_off_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_business_id_email_key" ON "staff"("business_id", "email");
CREATE INDEX "staff_business_id_is_active_idx" ON "staff"("business_id", "is_active");
CREATE INDEX "staff_time_off_business_id_starts_on_ends_on_idx" ON "staff_time_off"("business_id", "starts_on", "ends_on");
CREATE INDEX "staff_time_off_staff_id_starts_on_ends_on_idx" ON "staff_time_off"("staff_id", "starts_on", "ends_on");

-- AddForeignKey
ALTER TABLE "staff_time_off"
ADD CONSTRAINT "staff_time_off_staff_id_fkey"
FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "staff_time_off"
ADD CONSTRAINT "staff_time_off_business_id_fkey"
FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Ensure date ranges are valid.
ALTER TABLE "staff_time_off"
ADD CONSTRAINT "staff_time_off_date_range_check" CHECK ("ends_on" >= "starts_on");
