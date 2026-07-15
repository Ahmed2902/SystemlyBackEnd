-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "discount_cents" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "discount_cents" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "appointment_custom_items" (
    "id" UUID NOT NULL,
    "appointment_id" UUID NOT NULL,
    "description" VARCHAR(255) NOT NULL,
    "price_cents" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointment_custom_items_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "appointment_custom_items" ADD CONSTRAINT "appointment_custom_items_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
