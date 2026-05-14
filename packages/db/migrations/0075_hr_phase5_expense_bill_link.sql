-- 0075_hr_phase5_expense_bill_link.sql
-- Link expense claims to AP bills + the originating employee.

ALTER TABLE expense_claims
  ADD COLUMN IF NOT EXISTS bill_id UUID,
  ADD COLUMN IF NOT EXISTS employee_id UUID;

CREATE INDEX IF NOT EXISTS idx_ec_bill ON expense_claims(bill_id);
CREATE INDEX IF NOT EXISTS idx_ec_employee ON expense_claims(employee_id);
