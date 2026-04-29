-- Feature flags + app config (mobile version, store URLs, maintenance flag, etc).

CREATE TABLE IF NOT EXISTS feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(80) NOT NULL UNIQUE,
  name VARCHAR(160) NOT NULL,
  description TEXT,
  default_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  rollout_percentage INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenant_feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  flag_key VARCHAR(80) NOT NULL,
  enabled BOOLEAN NOT NULL,
  override_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, flag_key)
);

CREATE INDEX IF NOT EXISTS idx_tenant_flags_lookup ON tenant_feature_flags (tenant_id, flag_key);

-- App config: a simple key-value store (jsonb values) so we can manage the
-- mobile app version, store URLs, force-update message, maintenance flag, etc.
-- without redeploying the API.
CREATE TABLE IF NOT EXISTS app_config (
  key VARCHAR(80) PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES platform_users(id)
);

-- Seed defaults from current hardcoded values.
INSERT INTO app_config (key, value) VALUES
  ('mobile.currentVersion', '"1.0.0"'::jsonb),
  ('mobile.minVersion', '"1.0.0"'::jsonb),
  ('mobile.iosStoreUrl', '"https://apps.apple.com/app/runq/idTBD"'::jsonb),
  ('mobile.androidStoreUrl', '"https://play.google.com/store/apps/details?id=in.runq.app"'::jsonb),
  ('mobile.forceUpdateMessage', '"A new version of runQ is available with important improvements. Please update to continue."'::jsonb),
  ('platform.maintenance.enabled', 'false'::jsonb),
  ('platform.maintenance.message', '"runQ is undergoing scheduled maintenance. We will be back shortly."'::jsonb)
ON CONFLICT (key) DO NOTHING;
