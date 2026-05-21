-- FCM device registration tokens for the runQ mobile app.
--   * One row per physical device; token is globally unique.
--   * On re-register we upsert ON CONFLICT (token) and re-point tenant/user
--     so a shared device can be reused by a different employee.
--   * Dead tokens are pruned by the API when FCM reports them unregistered.

DO $$ BEGIN
  CREATE TYPE device_platform AS ENUM ('android', 'ios');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS device_tokens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id),
  user_id      uuid NOT NULL REFERENCES users(id),
  token        text NOT NULL UNIQUE,
  platform     device_platform NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_device_tokens_user ON device_tokens(user_id);
