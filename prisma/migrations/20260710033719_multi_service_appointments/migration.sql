/*
  Warnings:

  - You are about to drop the column `service_id` on the `appointments` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "appointments" DROP CONSTRAINT "appointments_service_id_fkey";

-- AlterTable
ALTER TABLE "appointments" DROP COLUMN "service_id";

-- CreateTable
CREATE TABLE "appointment_services" (
    "appointment_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "duration_min_snapshot" INTEGER NOT NULL,
    "price_egp_snapshot" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "appointment_services_pkey" PRIMARY KEY ("appointment_id","service_id")
);

-- CreateIndex
CREATE INDEX "appointment_services_appointment_id_order_idx" ON "appointment_services"("appointment_id", "order");

-- AddForeignKey
ALTER TABLE "appointment_services" ADD CONSTRAINT "appointment_services_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_services" ADD CONSTRAINT "appointment_services_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
