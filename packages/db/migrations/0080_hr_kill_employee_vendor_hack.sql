-- 0080_hr_kill_employee_vendor_hack.sql
-- Phase 3: stop shadowing employees as vendors for expense reimbursements.
--
--   * Add 2111 Employee Reimbursements Payable to existing tenants (new
--     tenants get it via the seed). The new posting flow credits it in place
--     of 2101 AP — no fake vendor needed.
--   * Add expense_claims.journal_entry_id so the new flow can link the
--     posted settlement JE. The legacy bill_id column is preserved on
--     historical claims that already have AP bills.
--   * Null out employees.vendor_id everywhere. The vendor rows themselves
--     stay in place (they have real posted history on legacy reimbursement
--     bills), but no employee is "linked" to one any more — new code paths
--     never touch vendors.

INSERT INTO accounts (tenant_id, code, name, type, parent_id, is_active, is_system_account)
SELECT
  t.id,
  '2111',
  'Employee Reimbursements Payable',
  'liability'::account_type,
  (SELECT id FROM accounts WHERE tenant_id = t.id AND code = '2100' LIMIT 1),
  TRUE,
  FALSE
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM accounts a WHERE a.tenant_id = t.id AND a.code = '2111'
);

ALTER TABLE expense_claims
  ADD COLUMN IF NOT EXISTS journal_entry_id UUID REFERENCES journal_entries(id);

UPDATE employees SET vendor_id = NULL WHERE vendor_id IS NOT NULL;
