-- Bill sync infrastructure: ingest bills from external systems (vrindavan-ops,
-- HRMS payroll exports, future POS systems, etc.) into AP without manual entry.
--
-- Design:
--   bill_sync_sources  — registered external systems per tenant, with API key
--                        and (optional) saved column mapping for CSV imports.
--   vendors.external_refs (jsonb)
--                      — generic per-source vendor identifiers, e.g.
--                        { "vrindavan-ops": "cpp_42", "acme-hrms": "emp_91" }.
--   purchase_invoices.source_id / external_id / external_version
--                      — provenance + idempotency. Unique on (source_id, external_id)
--                        so the same upstream bill resyncs to the same row.

CREATE TABLE IF NOT EXISTS bill_sync_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  slug VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  api_key_hash VARCHAR(128) NOT NULL,
  api_key_prefix VARCHAR(16) NOT NULL,
  mode VARCHAR(16) NOT NULL DEFAULT 'api',
  column_mapping JSONB NOT NULL DEFAULT '{}'::jsonb,
  date_format VARCHAR(32),
  amount_format VARCHAR(32),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_bill_sync_sources_tenant
  ON bill_sync_sources(tenant_id);

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS external_refs JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_vendors_external_refs
  ON vendors USING GIN (external_refs);

ALTER TABLE purchase_invoices
  ADD COLUMN IF NOT EXISTS source_id UUID REFERENCES bill_sync_sources(id),
  ADD COLUMN IF NOT EXISTS external_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS external_version INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS uq_pi_source_external
  ON purchase_invoices(source_id, external_id)
  WHERE source_id IS NOT NULL AND external_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS bill_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  source_id UUID NOT NULL REFERENCES bill_sync_sources(id),
  external_id VARCHAR(255),
  action VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL,
  bill_id UUID REFERENCES purchase_invoices(id),
  message TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bill_sync_logs_source_created
  ON bill_sync_logs(source_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bill_sync_logs_tenant_created
  ON bill_sync_logs(tenant_id, created_at DESC);
