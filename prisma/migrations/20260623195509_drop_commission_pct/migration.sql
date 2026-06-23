/*
  Warnings:

  - The `commission_pct` column on the `staff` table is being dropped since commission is now configured per-service via ServiceStaff.

*/
-- AlterTable
ALTER TABLE "staff" DROP COLUMN IF EXISTS "commission_pct";