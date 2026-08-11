-- Keep invoice branch ownership aligned with its appointment for every write path.
-- Historical appointment-backed invoices were backfilled in the branch foundation migration.
CREATE OR REPLACE FUNCTION set_invoice_branch_from_appointment()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.appointment_id IS NOT NULL THEN
    SELECT a.branch_id
      INTO NEW.branch_id
      FROM appointments a
     WHERE a.id = NEW.appointment_id
       AND a.business_id = NEW.business_id;

    IF NEW.branch_id IS NULL THEN
      RAISE EXCEPTION 'Invoice appointment must belong to a branch';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS invoices_set_branch_from_appointment ON invoices;
CREATE TRIGGER invoices_set_branch_from_appointment
BEFORE INSERT OR UPDATE OF appointment_id, business_id
ON invoices
FOR EACH ROW
EXECUTE FUNCTION set_invoice_branch_from_appointment();
