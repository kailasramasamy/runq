-- 0185_device_token_app_scope.sql
-- Scope FCM device tokens to the app that registered them.
--
-- runQ mobile and Dhenu both POST /dashboard/device-token, and both resolve
-- to the same users.id whenever the phone number matches (mp-auth reuses the
-- existing user row on purpose). device_tokens had no way to tell the two
-- apart, so sendPushToUser() — which selects every token for a
-- (tenant_id, user_id) pair — fanned every notification out to both phones:
-- an HR leave approval buzzed the milk-procurement app and vice versa.
--
-- Existing rows default to 'runq'. Both apps re-register their token on every
-- launch, so a mislabelled Dhenu row corrects itself the next time that app
-- is opened; until then it behaves exactly as it does today.

DO $$ BEGIN
  CREATE TYPE device_app AS ENUM ('runq', 'dhenu');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE device_tokens
  ADD COLUMN IF NOT EXISTS app device_app NOT NULL DEFAULT 'runq';

-- Sends always filter on (tenant_id, user_id, app); the old user-only index
-- no longer covers the lookup.
CREATE INDEX IF NOT EXISTS idx_device_tokens_user_app
  ON device_tokens (user_id, app);
