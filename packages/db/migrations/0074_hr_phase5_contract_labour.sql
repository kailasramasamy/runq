-- 0074_hr_phase5_contract_labour.sql
-- HR Phase 5: contract labour fields on employees + vendor linkage.

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS agency VARCHAR(150),
  ADD COLUMN IF NOT EXISTS daily_wage_rate NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS vendor_id UUID;

CREATE INDEX IF NOT EXISTS idx_emp_vendor ON employees(vendor_id);

ALTER TABLE expense_claims
  ADD COLUMN IF NOT EXISTS bill_id UUID,
  ADD COLUMN IF NOT EXISTS employee_id UUID;

CREATE INDEX IF NOT EXISTS idx_ec_bill ON expense_claims(bill_id);
CREATE INDEX IF NOT EXISTS idx_ec_employee ON expense_claims(employee_id);
