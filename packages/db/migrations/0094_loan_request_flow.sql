-- Employee-originated loan requests: add 'requested' and 'rejected' statuses
-- and a rejection_reason column. HR reviews requested loans, then approves
-- (→ active + EMI schedule) or rejects (→ rejected + reason).

ALTER TYPE loan_status ADD VALUE IF NOT EXISTS 'requested';
ALTER TYPE loan_status ADD VALUE IF NOT EXISTS 'rejected';

ALTER TABLE employee_loans
  ADD COLUMN IF NOT EXISTS rejection_reason text;
