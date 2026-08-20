-- 0196_partner_api_keys.sql
--
-- Read-only machine credentials for downstream partners. First consumer is
-- 4amFresh's customer backend, which pulls the daily plant-level milk quality
-- feed (`/api/v1/partner/milk-quality/daily`) and caches it for its mobile app.
--
-- Mirrors bill_sync_sources (slug + hashed key, tenant derived from the row)
-- but read-only and scope-gated: a key grants exactly the scopes listed on it.
--
-- Apply in native dev via packages/db/scripts/run-sql.ts (drizzle-kit push is
-- the prod path).

BEGIN;

CREATE TABLE IF NOT EXISTS partner_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  slug varchar(64) NOT NULL,
  name varchar(255) NOT NULL,
  api_key_hash varchar(128) NOT NULL,
  api_key_prefix varchar(16) NOT NULL,
  scopes varchar(64)[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_api_keys_tenant_id_slug_unique UNIQUE (tenant_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_partner_api_keys_tenant ON partner_api_keys (tenant_id);

-- Authentication looks a key up by (slug, hash) with no tenant context, so the
-- hash needs its own index: the tenant index above can't serve that lookup.
CREATE INDEX IF NOT EXISTS idx_partner_api_keys_lookup ON partner_api_keys (slug, api_key_hash);

COMMIT;
