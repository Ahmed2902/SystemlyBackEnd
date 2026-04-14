/*
  Warnings:

  - A unique constraint covering the columns `[providerId]` on the table `business_users` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `provider` to the `business_users` table without a default value. This is not possible if the table is not empty.
  - Added the required column `providerId` to the `business_users` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "business_users" ADD COLUMN     "provider" TEXT NOT NULL,
ADD COLUMN     "providerId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "business_users_providerId_key" ON "business_users"("providerId");
