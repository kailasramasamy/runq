-- 0067_po_template_patterns.sql
-- Per-tenant learned PO layouts. Each row caches hints derived from a
-- successful LLM extraction so that future POs with the same structural
-- fingerprint can be parsed locally (no LLM call).

CREATE TABLE IF NOT EXISTS po_template_patterns (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id),
  fingerprint  VARCHAR(64) NOT NULL,
  format       VARCHAR(20) NOT NULL,
  hints        JSONB NOT NULL,
  use_count    INTEGER NOT NULL DEFAULT 1,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_po_template_patterns_fp
  ON po_template_patterns (tenant_id, fingerprint);

CREATE INDEX IF NOT EXISTS idx_po_template_patterns_tenant
  ON po_template_patterns (tenant_id);
