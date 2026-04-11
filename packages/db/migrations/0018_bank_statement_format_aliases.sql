-- Bank statement format aliases: stores learned column mappings per bank per tenant
-- so future imports of the same bank statement format skip AI and use local intelligence.

CREATE TABLE IF NOT EXISTS bank_statement_format_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  bank_name_pattern VARCHAR(255) NOT NULL,
  header_signature VARCHAR(1000) NOT NULL,
  column_mapping JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bsfa_tenant_header
  ON bank_statement_format_aliases (tenant_id, header_signature);
