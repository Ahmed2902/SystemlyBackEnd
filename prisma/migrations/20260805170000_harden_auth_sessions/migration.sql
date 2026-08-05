ALTER TABLE "refresh_tokens"
  RENAME COLUMN "expiresAt" TO "expires_at";

ALTER TABLE "refresh_tokens"
  ADD COLUMN "family_id" UUID,
  ADD COLUMN "replaced_by_token_id" UUID,
  ADD COLUMN "revoked_at" TIMESTAMPTZ;

UPDATE "refresh_tokens"
SET "family_id" = "id"
WHERE "family_id" IS NULL;

ALTER TABLE "refresh_tokens"
  ALTER COLUMN "family_id" SET NOT NULL,
  ADD CONSTRAINT "refresh_tokens_replaced_by_token_id_fkey"
    FOREIGN KEY ("replaced_by_token_id")
    REFERENCES "refresh_tokens"("id")
    ON DELETE SET NULL;

CREATE INDEX "refresh_tokens_user_id_family_id_idx"
  ON "refresh_tokens"("user_id", "family_id");

CREATE INDEX "refresh_tokens_family_id_revoked_idx"
  ON "refresh_tokens"("family_id", "revoked");

CREATE TABLE "auth_action_tokens" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "purpose" VARCHAR(40) NOT NULL,
  "token_hash" VARCHAR(64) NOT NULL UNIQUE,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "used_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "auth_action_tokens_user_id_fkey"
    FOREIGN KEY ("user_id")
    REFERENCES "business_users"("id")
    ON DELETE CASCADE,
  CONSTRAINT "auth_action_tokens_purpose_check"
    CHECK ("purpose" IN ('EMAIL_VERIFICATION', 'PASSWORD_RESET'))
);

CREATE INDEX "auth_action_tokens_user_purpose_idx"
  ON "auth_action_tokens"("user_id", "purpose", "used_at");

CREATE INDEX "auth_action_tokens_expiry_idx"
  ON "auth_action_tokens"("expires_at");
