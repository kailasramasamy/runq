-- Phase 1 multi-tenant: user_tenants join table
-- Enables one user to belong to multiple tenants (CA firm use case)

CREATE TABLE IF NOT EXISTS user_tenants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role        user_role NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS user_tenants_user_tenant_unique
  ON user_tenants(user_id, tenant_id);

CREATE INDEX IF NOT EXISTS user_tenants_user_idx ON user_tenants(user_id);
CREATE INDEX IF NOT EXISTS user_tenants_tenant_idx ON user_tenants(tenant_id);

-- Backfill: every existing (user_id, tenant_id, role) becomes a membership row.
-- Uses ON CONFLICT to make this migration idempotent in case it's re-run.
INSERT INTO user_tenants (user_id, tenant_id, role, created_at, updated_at)
SELECT id, tenant_id, role, created_at, updated_at
FROM users
ON CONFLICT (user_id, tenant_id) DO NOTHING;

-- Sanity check: warn on any user with no membership row.
-- (Doesn't fail the migration; reported via NOTICE for manual review.)
DO $$
DECLARE
  orphan_count int;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM users u
  WHERE NOT EXISTS (SELECT 1 FROM user_tenants ut WHERE ut.user_id = u.id);
  IF orphan_count > 0 THEN
    RAISE NOTICE 'WARN: % users have no user_tenants membership row after backfill', orphan_count;
  END IF;
END $$;
