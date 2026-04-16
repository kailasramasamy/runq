-- GSTR-2B reconciliation: raw 2B storage + match results

DO $$ BEGIN CREATE TYPE gstr2b_match_status AS ENUM ('matched', 'mismatched', 'not_in_books', 'not_in_2b'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS gstr2b_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  gstin VARCHAR(15) NOT NULL,
  period VARCHAR(6) NOT NULL,
  data JSONB NOT NULL,
  pulled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, period)
);

CREATE INDEX IF NOT EXISTS idx_gstr2b_tenant_period ON gstr2b_data (tenant_id, period);

CREATE TABLE IF NOT EXISTS gstr2b_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  gstr2b_id UUID NOT NULL REFERENCES gstr2b_data(id) ON DELETE CASCADE,
  period VARCHAR(6) NOT NULL,
  supplier_gstin VARCHAR(15) NOT NULL,
  supplier_name VARCHAR(255),
  invoice_number_2b VARCHAR(50) NOT NULL,
  invoice_date_2b VARCHAR(10),
  taxable_value_2b DECIMAL(15,2) NOT NULL DEFAULT 0,
  igst_2b DECIMAL(15,2) NOT NULL DEFAULT 0,
  cgst_2b DECIMAL(15,2) NOT NULL DEFAULT 0,
  sgst_2b DECIMAL(15,2) NOT NULL DEFAULT 0,
  purchase_invoice_id UUID,
  invoice_number_books VARCHAR(50),
  taxable_value_books DECIMAL(15,2),
  igst_books DECIMAL(15,2),
  cgst_books DECIMAL(15,2),
  sgst_books DECIMAL(15,2),
  match_status gstr2b_match_status NOT NULL,
  value_diff DECIMAL(15,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gstr2b_match_tenant_period ON gstr2b_matches (tenant_id, period);
CREATE INDEX IF NOT EXISTS idx_gstr2b_match_status ON gstr2b_matches (tenant_id, match_status);
CREATE INDEX IF NOT EXISTS idx_gstr2b_match_pi ON gstr2b_matches (purchase_invoice_id);
