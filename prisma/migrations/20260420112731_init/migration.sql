-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "expired_handled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "trial_notified_1day" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "trial_notified_3days" BOOLEAN NOT NULL DEFAULT false;
