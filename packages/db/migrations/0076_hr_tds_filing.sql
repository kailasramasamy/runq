-- 0076_hr_tds_filing.sql
-- HR TDS filing: monthly deposit challans (ITNS-281) + quarterly Form 24Q returns.

DO $$ BEGIN
  CREATE TYPE tds_challan_status AS ENUM ('pending', 'deposited');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE tds_return_status AS ENUM ('draft', 'validated', 'generated', 'filed', 'error');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS tds_challans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  payroll_run_id UUID REFERENCES payroll_runs(id) ON DELETE SET NULL,
  period_month INTEGER NOT NULL,
  period_year INTEGER NOT NULL,
  section VARCHAR(10) NOT NULL DEFAULT '192',
  tds_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
  interest_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
  late_fee_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
  status tds_challan_status NOT NULL DEFAULT 'pending',
  bsr_code VARCHAR(7),
  challan_serial_no VARCHAR(10),
  deposit_date DATE,
  payment_mode VARCHAR(30),
  bank_ref VARCHAR(50),
  deposited_by UUID REFERENCES users(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tds_challan_tenant_status ON tds_challans(tenant_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tds_challan_period
  ON tds_challans(tenant_id, period_year, period_month, section);

CREATE TABLE IF NOT EXISTS tds_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  tan VARCHAR(10) NOT NULL,
  return_type VARCHAR(10) NOT NULL DEFAULT '24q',
  financial_year VARCHAR(7) NOT NULL,
  quarter INTEGER NOT NULL,
  status tds_return_status NOT NULL DEFAULT 'draft',
  data JSONB,
  error_details JSONB,
  token VARCHAR(50),
  filed_at TIMESTAMPTZ,
  filed_by UUID REFERENCES users(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tds_return_tenant_status ON tds_returns(tenant_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tds_return_period
  ON tds_returns(tenant_id, return_type, financial_year, quarter);
