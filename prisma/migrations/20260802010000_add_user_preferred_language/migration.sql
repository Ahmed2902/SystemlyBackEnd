ALTER TABLE "business_users"
ADD COLUMN "preferred_language" VARCHAR(5) NOT NULL DEFAULT 'en';

ALTER TABLE "business_users"
ADD CONSTRAINT "business_users_preferred_language_check"
CHECK ("preferred_language" IN ('en', 'ar'));
