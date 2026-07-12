/*
  Warnings:

  - The primary key for the `appointment_services` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - Added the required column `ends_at` to the `appointment_services` table without a default value. This is not possible if the table is not empty.
  - The required column `id` was added to the `appointment_services` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.
  - Added the required column `staff_id` to the `appointment_services` table without a default value. This is not possible if the table is not empty.
  - Added the required column `starts_at` to the `appointment_services` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "appointment_services" DROP CONSTRAINT "appointment_services_pkey",
ADD COLUMN     "ends_at" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "id" UUID NOT NULL,
ADD COLUMN     "staff_id" UUID NOT NULL,
ADD COLUMN     "starts_at" TIMESTAMP(3) NOT NULL,
ADD CONSTRAINT "appointment_services_pkey" PRIMARY KEY ("id");

-- CreateIndex
CREATE INDEX "appointment_services_staff_id_starts_at_idx" ON "appointment_services"("staff_id", "starts_at");

-- AddForeignKey
ALTER TABLE "appointment_services" ADD CONSTRAINT "appointment_services_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
