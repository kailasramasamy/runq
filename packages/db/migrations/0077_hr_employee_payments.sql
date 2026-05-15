-- 0077_hr_employee_payments.sql
-- Payroll subledger settlement primitive: money paid TO an employee, either
-- net pay (against a payroll run) or reimbursement (against an expense claim).
-- Plus a reconciliation FK so bank statements can match these on the recon
-- screen the same way they match AP payments and AR receipts.

DO $$ BEGIN
  CREATE TYPE employee_payment_source AS ENUM ('payroll_run', 'expense_claim');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE employee_payment_status AS ENUM ('pending', 'paid');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE employee_payment_method AS ENUM ('bank_transfer', 'cash', 'cheque');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS employee_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  source_type employee_payment_source NOT NULL,
  payroll_run_id UUID REFERENCES payroll_runs(id) ON DELETE SET NULL,
  expense_claim_id UUID REFERENCES expense_claims(id) ON DELETE SET NULL,
  employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  payment_date DATE NOT NULL,
  amount NUMERIC(15, 2) NOT NULL,
  bank_account_id UUID REFERENCES bank_accounts(id),
  payment_method employee_payment_method NOT NULL DEFAULT 'bank_transfer',
  reference VARCHAR(100),
  status employee_payment_status NOT NULL DEFAULT 'pending',
  journal_entry_id UUID REFERENCES journal_entries(id),
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ep_tenant_status ON employee_payments(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_ep_tenant_run ON employee_payments(tenant_id, payroll_run_id);
CREATE INDEX IF NOT EXISTS idx_ep_tenant_claim ON employee_payments(tenant_id, expense_claim_id);

ALTER TABLE reconciliation_matches
  ADD COLUMN IF NOT EXISTS employee_payment_id UUID REFERENCES employee_payments(id);
CREATE INDEX IF NOT EXISTS idx_rm_employee_payment_id
  ON reconciliation_matches(employee_payment_id);
