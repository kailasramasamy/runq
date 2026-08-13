-- Employee recoveries: ad-hoc deductions, plus the plumbing payroll needs to
-- actually consume loan/advance EMIs (the EMI schedule existed but nothing
-- ever read it).

CREATE TYPE employee_deduction_category AS ENUM (
  'goods_purchase', 'canteen', 'damage', 'uniform', 'fine', 'other'
);
CREATE TYPE employee_deduction_status AS ENUM ('active', 'recovered', 'cancelled');

CREATE TABLE IF NOT EXISTS employee_deductions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id),
  employee_id   uuid NOT NULL REFERENCES employees(id),
  category      employee_deduction_category NOT NULL DEFAULT 'other',
  description   text,
  amount        numeric(15,2) NOT NULL,
  instalment    numeric(15,2) NOT NULL,
  outstanding   numeric(15,2) NOT NULL,
  start_month   integer NOT NULL,
  start_year    integer NOT NULL,
  status        employee_deduction_status NOT NULL DEFAULT 'active',
  created_by    uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_empded_tenant_status ON employee_deductions (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_empded_tenant_emp ON employee_deductions (tenant_id, employee_id);

CREATE TABLE IF NOT EXISTS employee_deduction_recoveries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  deduction_id    uuid NOT NULL REFERENCES employee_deductions(id) ON DELETE CASCADE,
  payroll_run_id  uuid NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  amount          numeric(15,2) NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_eddedrec_run ON employee_deduction_recoveries (tenant_id, payroll_run_id);
CREATE INDEX IF NOT EXISTS idx_eddedrec_deduction ON employee_deduction_recoveries (deduction_id);

-- Partial recovery: a month with heavy LOP may not absorb the whole EMI, so an
-- instalment can be part-paid and finish next run.
ALTER TABLE employee_loan_instalments
  ADD COLUMN IF NOT EXISTS paid_amount numeric(15,2) NOT NULL DEFAULT 0;

-- Disbursing an advance is a real cash movement, so it settles through the
-- same subledger as net pay and reimbursements.
ALTER TYPE employee_payment_source ADD VALUE IF NOT EXISTS 'employee_loan';
ALTER TABLE employee_payments
  ADD COLUMN IF NOT EXISTS employee_loan_id uuid REFERENCES employee_loans(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_ep_tenant_loan ON employee_payments (tenant_id, employee_loan_id);

-- Contra account for non-loan recoveries (canteen, goods bought from the
-- company, damages). Loan/advance recovery credits 1122 Employee Advances
-- instead, since that money was booked as a receivable when disbursed.
INSERT INTO accounts (tenant_id, code, name, type, parent_id, is_system_account, is_active)
SELECT t.id, '4208', 'Employee Recoveries', 'revenue', p.id, true, true
FROM tenants t
LEFT JOIN accounts p ON p.tenant_id = t.id AND p.code = '4200'
WHERE NOT EXISTS (
  SELECT 1 FROM accounts a WHERE a.tenant_id = t.id AND a.code = '4208'
);
