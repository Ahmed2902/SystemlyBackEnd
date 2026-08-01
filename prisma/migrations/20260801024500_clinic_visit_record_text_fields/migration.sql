ALTER TABLE "clinic_visit_records"
  RENAME COLUMN "notes" TO "clinical_session_notes";

ALTER TABLE "clinic_visit_records"
  RENAME COLUMN "diagnosis" TO "diagnosis_assessment";

ALTER TABLE "clinic_visit_records"
  ADD COLUMN "plan_and_prescription" TEXT;

UPDATE "clinic_visit_records"
SET "plan_and_prescription" = "prescription_json" #>> '{}'
WHERE "prescription_json" IS NOT NULL;

ALTER TABLE "clinic_visit_records"
  DROP COLUMN "prescription_json";
