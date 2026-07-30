-- Restore indexes used by the current calendar, appointment custom-item, and
-- paid-invoice analytics read paths. Earlier SQL-only indexes were removed by
-- a later schema-alignment migration.

CREATE INDEX IF NOT EXISTS "appointments_business_id_ends_at_idx"
  ON "appointments" ("business_id", "ends_at");

CREATE INDEX IF NOT EXISTS "appointment_custom_items_appointment_id_idx"
  ON "appointment_custom_items" ("appointment_id");

CREATE INDEX IF NOT EXISTS "staff_breaks_business_id_break_date_start_time_idx"
  ON "staff_breaks" ("business_id", "break_date", "start_time");

CREATE INDEX IF NOT EXISTS "invoices_paid_business_paid_at_idx"
  ON "invoices" ("business_id", "paid_at" DESC)
  INCLUDE ("total_cents", "customer_id")
  WHERE "status" = 'paid';
