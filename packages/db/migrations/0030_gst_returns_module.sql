-- GST Returns module: returns, return-invoice linkage, GSP auth tokens

DO $$ BEGIN CREATE TYPE gst_return_type AS ENUM ('gstr1', 'gstr3b'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE gst_return_status AS ENUM ('draft', 'validated', 'uploaded', 'filed', 'error'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE gst_filing_frequency AS ENUM ('monthly', 'quarterly'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE gstr1_section AS ENUM ('b2b', 'b2cl', 'b2cs', 'cdn', 'exp', 'nil'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS gst_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  gstin VARCHAR(15) NOT NULL,
  return_type gst_return_type NOT NULL,
  period VARCHAR(6) NOT NULL,
  filing_frequency gst_filing_frequency NOT NULL DEFAULT 'monthly',
  status gst_return_status NOT NULL DEFAULT 'draft',
  data JSONB,
  error_details JSONB,
  arn VARCHAR(50),
  filed_at TIMESTAMPTZ,
  filed_by UUID REFERENCES users(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, return_type, period)
);

CREATE INDEX IF NOT EXISTS idx_gst_ret_tenant_status ON gst_returns (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_gst_ret_tenant_period ON gst_returns (tenant_id, period);

CREATE TABLE IF NOT EXISTS gst_return_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  return_id UUID NOT NULL REFERENCES gst_returns(id) ON DELETE CASCADE,
  invoice_id UUID,
  credit_note_id UUID,
  section gstr1_section NOT NULL,
  included BOOLEAN NOT NULL DEFAULT true,
  amendment_of_return_id UUID REFERENCES gst_returns(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gst_ri_return ON gst_return_invoices (return_id);
CREATE INDEX IF NOT EXISTS idx_gst_ri_invoice ON gst_return_invoices (invoice_id);

CREATE TABLE IF NOT EXISTS gsp_auth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  gstin VARCHAR(15) NOT NULL,
  gsp_provider VARCHAR(50) NOT NULL,
  access_token TEXT NOT NULL,
  txn VARCHAR(100),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gsp_auth_tenant_gstin ON gsp_auth_tokens (tenant_id, gstin);
