-- DropIndex
DROP INDEX "appointments_business_id_ends_at_idx";

-- DropIndex
DROP INDEX "appointments_business_id_status_starts_at_idx";

-- DropIndex
DROP INDEX "appointments_customer_id_status_starts_at_idx";

-- DropIndex
DROP INDEX "customers_business_id_created_at_idx";

-- DropIndex
DROP INDEX "customers_business_id_updated_at_name_idx";

-- DropIndex
DROP INDEX "customers_phone_trgm_idx";

-- DropIndex
DROP INDEX "invoices_business_id_payment_method_issued_at_idx";

-- DropIndex
DROP INDEX "invoices_business_id_status_issued_at_created_at_idx";

-- DropIndex
DROP INDEX "services_business_id_is_active_name_idx";

-- DropIndex
DROP INDEX "staff_business_id_is_active_name_idx";

-- DropIndex
DROP INDEX "staff_phone_trgm_idx";

-- DropIndex
DROP INDEX "staff_breaks_business_id_break_date_start_time_idx";
