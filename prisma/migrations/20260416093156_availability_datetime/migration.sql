/*
  Warnings:

  - The `start_time` column on the `availability_overrides` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `end_time` column on the `availability_overrides` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Changed the type of `start_time` on the `availability` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `end_time` on the `availability` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable
ALTER TABLE "availability" DROP COLUMN "start_time",
ADD COLUMN     "start_time" TIMESTAMP(3) NOT NULL,
DROP COLUMN "end_time",
ADD COLUMN     "end_time" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "availability_overrides" DROP COLUMN "start_time",
ADD COLUMN     "start_time" TIMESTAMP(3),
DROP COLUMN "end_time",
ADD COLUMN     "end_time" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "availability_staff_id_day_of_week_start_time_end_time_key" ON "availability"("staff_id", "day_of_week", "start_time", "end_time");
