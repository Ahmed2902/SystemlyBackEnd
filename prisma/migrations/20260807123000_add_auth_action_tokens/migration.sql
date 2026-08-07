CREATE TABLE "auth_action_tokens" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "purpose" VARCHAR(32) NOT NULL,
  "token_hash" VARCHAR(128) NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "used_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "auth_action_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "auth_action_tokens_token_hash_key"
  ON "auth_action_tokens"("token_hash");

CREATE INDEX "auth_action_tokens_user_id_purpose_created_at_idx"
  ON "auth_action_tokens"("user_id", "purpose", "created_at");

CREATE INDEX "auth_action_tokens_expires_at_idx"
  ON "auth_action_tokens"("expires_at");

ALTER TABLE "auth_action_tokens"
  ADD CONSTRAINT "auth_action_tokens_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "business_users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
