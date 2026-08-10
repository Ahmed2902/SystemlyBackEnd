ALTER TABLE "customers"
ADD COLUMN "date_of_birth" DATE,
ADD COLUMN "gender" VARCHAR(20);

ALTER TABLE "customers"
ADD CONSTRAINT "customers_gender_check"
CHECK ("gender" IS NULL OR "gender" IN ('male', 'female'));
