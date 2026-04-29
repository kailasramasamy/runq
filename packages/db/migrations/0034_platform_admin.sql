-- Super-admin platform: platform users (separate from tenant users) and audit log.
-- Platform users have no tenant_id; they manage all tenants via /admin.

DO $$ BEGIN
  CREATE TYPE platform_role AS ENUM ('super_admin', 'support', 'billing_ops', 'read_only');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS platform_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role platform_role NOT NULL DEFAULT 'support',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  mfa_secret VARCHAR(255),
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_users_email ON platform_users (email);

CREATE TABLE IF NOT EXISTS platform_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_user_id UUID REFERENCES platform_users(id),
  action VARCHAR(80) NOT NULL,
  target_type VARCHAR(50) NOT NULL,
  target_id UUID,
  target_tenant_id UUID REFERENCES tenants(id),
  metadata JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pal_user_created ON platform_audit_log (platform_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pal_target ON platform_audit_log (target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_pal_tenant ON platform_audit_log (target_tenant_id, created_at DESC);
