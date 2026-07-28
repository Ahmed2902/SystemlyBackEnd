-- Indexes for the measured Calendar, Customers, Staff and Invoices query paths.
-- These are intentionally implemented as SQL-only indexes because several use
-- PostgreSQL partial/expression/GIN features that Prisma schema attributes
-- cannot represent accurately.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Calendar and appointment list range scans.
CREATE INDEX IF NOT EXISTS "appointments_business_id_status_starts_at_idx"
  ON "appointments" ("business_id", "status", "starts_at");

CREATE INDEX IF NOT EXISTS "appointments_business_id_ends_at_idx"
  ON "appointments" ("business_id", "ends_at");

CREATE INDEX IF NOT EXISTS "appointments_customer_id_status_starts_at_idx"
  ON "appointments" ("customer_id", "status", "starts_at");

-- Calendar support data is always scoped by tenant/date or tenant/active state.
CREATE INDEX IF NOT EXISTS "staff_breaks_business_id_break_date_start_time_idx"
  ON "staff_breaks" ("business_id", "break_date", "start_time");

CREATE INDEX IF NOT EXISTS "staff_business_id_is_active_name_idx"
  ON "staff" ("business_id", "is_active", "name");

CREATE INDEX IF NOT EXISTS "services_business_id_is_active_name_idx"
  ON "services" ("business_id", "is_active", "name");

-- Customer list ordering and common filters.
CREATE INDEX IF NOT EXISTS "customers_business_id_updated_at_name_idx"
  ON "customers" ("business_id", "updated_at" DESC, "name");

CREATE INDEX IF NOT EXISTS "customers_business_id_no_show_count_idx"
  ON "customers" ("business_id", "no_show_count")
  WHERE "no_show_count" > 0;

CREATE INDEX IF NOT EXISTS "customers_business_id_created_at_idx"
  ON "customers" ("business_id", "created_at" DESC);

-- Invoice list filters and stable newest-first ordering.
CREATE INDEX IF NOT EXISTS "invoices_business_id_payment_method_issued_at_idx"
  ON "invoices" ("business_id", "payment_method", "issued_at" DESC);

CREATE INDEX IF NOT EXISTS "invoices_business_id_status_issued_at_created_at_idx"
  ON "invoices" ("business_id", "status", "issued_at" DESC, "created_at" DESC);

-- Substring searches use contains/ILIKE. B-tree indexes cannot accelerate
-- those expressions, so use trigram indexes and let PostgreSQL combine them
-- with the tenant B-tree indexes through bitmap scans.
CREATE INDEX IF NOT EXISTS "customers_name_trgm_idx"
  ON "customers" USING GIN (LOWER("name") gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "customers_phone_trgm_idx"
  ON "customers" USING GIN ("phone" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "customers_email_trgm_idx"
  ON "customers" USING GIN (LOWER("email") gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "staff_name_trgm_idx"
  ON "staff" USING GIN (LOWER("name") gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "staff_job_title_trgm_idx"
  ON "staff" USING GIN (LOWER("job_title") gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "staff_phone_trgm_idx"
  ON "staff" USING GIN ("phone" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "staff_email_trgm_idx"
  ON "staff" USING GIN (LOWER("email") gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "invoices_invoice_number_trgm_idx"
  ON "invoices" USING GIN (LOWER("invoiceNumber") gin_trgm_ops);
