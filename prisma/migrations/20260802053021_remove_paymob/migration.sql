/*
  Warnings:

  - You are about to drop the column `paymob_subscription_id` on the `subscriptions` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "subscriptions" DROP COLUMN "paymob_subscription_id";
