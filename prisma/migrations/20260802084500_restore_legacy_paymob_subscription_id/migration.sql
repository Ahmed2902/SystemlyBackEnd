-- PR #42 still supports the legacy Paymob checkout until the provider-neutral
-- payment ledger and EasyKash adapter replace it. A later migration removed
-- this nullable identifier, so restore it without changing existing rows.
ALTER TABLE "subscriptions"
  ADD COLUMN IF NOT EXISTS "paymob_subscription_id" VARCHAR(255);
