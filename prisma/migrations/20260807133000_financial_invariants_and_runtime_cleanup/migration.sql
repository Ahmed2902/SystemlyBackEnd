-- V1 guarantees at most one currently-paid invoice per appointment.
-- Voided invoices do not participate, so an appointment can be paid again after a void.
CREATE UNIQUE INDEX "invoices_one_paid_per_appointment"
  ON "invoices" ("appointment_id")
  WHERE "appointment_id" IS NOT NULL AND "status" = 'paid';

-- Removed V1 runtime features: legacy reminder/notification logs and ETA receipt fields.
DROP TABLE IF EXISTS "reminder_logs";
DROP TABLE IF EXISTS "notification_logs";

ALTER TABLE "appointments"
  DROP COLUMN IF EXISTS "reminder_sent",
  DROP COLUMN IF EXISTS "confirmation_sent";

ALTER TABLE "invoices"
  DROP COLUMN IF EXISTS "eta_receipt_uid",
  DROP COLUMN IF EXISTS "eta_submitted_at";

DROP TYPE IF EXISTS "NotificationChannel";
