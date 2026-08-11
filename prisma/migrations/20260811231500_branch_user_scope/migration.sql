ALTER TABLE "business_users"
  ADD COLUMN "branch_id" UUID;

CREATE INDEX "business_users_business_id_branch_id_idx"
  ON "business_users"("business_id", "branch_id");

ALTER TABLE "business_users"
  ADD CONSTRAINT "business_users_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
