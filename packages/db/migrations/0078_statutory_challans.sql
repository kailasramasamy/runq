-- 0078_statutory_challans.sql
-- Unify statutory challan tracking across PF / ESI / PT / TDS into one table.
-- Migrate existing tds_challans rows in, then drop the TDS-only table.
-- Recording a deposit henceforth posts a settlement JE (handled in service code)
-- and is reconcilable against the bank statement via reconciliation_matches.

DO $$ BEGIN
  CREATE TYPE statutory_challan_kind AS ENUM ('pf', 'esi', 'pt', 'tds');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE statutory_challan_status AS ENUM ('pending', 'deposited');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS statutory_challans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  kind statutory_challan_kind NOT NULL,
  payroll_run_id UUID REFERENCES payroll_runs(id) ON DELETE SET NULL,
  period_month INTEGER NOT NULL,
  period_year INTEGER NOT NULL,
  state_code VARCHAR(2),
  section VARCHAR(10),
  liability_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
  interest_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
  late_fee_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
  amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
  status statutory_challan_status NOT NULL DEFAULT 'pending',
  bank_bsr_code VARCHAR(7),
  reference_number VARCHAR(30),
  deposit_date DATE,
  payment_mode VARCHAR(30),
  bank_ref VARCHAR(50),
  bank_account_id UUID REFERENCES bank_accounts(id),
  journal_entry_id UUID REFERENCES journal_entries(id),
  notes TEXT,
  deposited_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sc_tenant_status ON statutory_challans(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_sc_tenant_kind ON statutory_challans(tenant_id, kind);
CREATE INDEX IF NOT EXISTS idx_sc_tenant_run ON statutory_challans(tenant_id, payroll_run_id);

-- Lift existing tds_challans rows into the unified table. The status enum
-- values match ('pending', 'deposited') so the cast through text is safe.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tds_challans') THEN
    INSERT INTO statutory_challans (
      id, tenant_id, kind, payroll_run_id, period_month, period_year, section,
      liability_amount, interest_amount, late_fee_amount, amount,
      status, bank_bsr_code, reference_number, deposit_date, payment_mode, bank_ref,
      deposited_by, notes, created_at, updated_at
    )
    SELECT
      id, tenant_id, 'tds'::statutory_challan_kind, payroll_run_id,
      period_month, period_year, section,
      tds_amount, interest_amount, late_fee_amount, total_amount,
      status::text::statutory_challan_status,
      bsr_code, challan_serial_no, deposit_date, payment_mode, bank_ref,
      deposited_by, notes, created_at, updated_at
    FROM tds_challans;
  END IF;
END $$;

ALTER TABLE reconciliation_matches
  ADD COLUMN IF NOT EXISTS statutory_challan_id UUID REFERENCES statutory_challans(id);
CREATE INDEX IF NOT EXISTS idx_rm_statutory_challan_id
  ON reconciliation_matches(statutory_challan_id);

DROP TABLE IF EXISTS tds_challans;
DROP TYPE IF EXISTS tds_challan_status;
