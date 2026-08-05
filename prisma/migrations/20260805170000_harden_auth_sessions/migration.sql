CREATE TABLE "auth_sessions" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "family_id" UUID NOT NULL,
  "token_hash" VARCHAR(64) NOT NULL UNIQUE,
  "replaced_by_session_id" UUID,
  "revoked_at" TIMESTAMPTZ,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "auth_sessions_user_id_family_id_idx"
  ON "auth_sessions"("user_id", "family_id");

CREATE INDEX "auth_sessions_family_id_revoked_at_idx"
  ON "auth_sessions"("family_id", "revoked_at");

CREATE TABLE "auth_action_tokens" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "purpose" VARCHAR(40) NOT NULL,
  "token_hash" VARCHAR(64) NOT NULL UNIQUE,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "used_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "auth_action_tokens_user_id_purpose_used_at_idx"
  ON "auth_action_tokens"("user_id", "purpose", "used_at");

CREATE INDEX "auth_action_tokens_expires_at_idx"
  ON "auth_action_tokens"("expires_at");
