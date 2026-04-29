-- Tenant lifecycle: status, plan link, key timestamps for super-admin panel.

DO $$ BEGIN
  CREATE TYPE tenant_status AS ENUM ('trial', 'active', 'past_due', 'suspended', 'churned');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS status tenant_status NOT NULL DEFAULT 'trial',
  ADD COLUMN IF NOT EXISTS plan_id UUID,
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspended_reason TEXT,
  ADD COLUMN IF NOT EXISTS mrr_cents INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants (status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tenants_last_active ON tenants (last_active_at DESC) WHERE deleted_at IS NULL;

-- Backfill: existing tenants are 'active' (not trial — they signed up before this column existed).
UPDATE tenants SET status = 'active' WHERE status = 'trial' AND created_at < NOW() - INTERVAL '1 day';
