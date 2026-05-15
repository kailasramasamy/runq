-- 0079_statutory_expense_accounts.sql
-- Backfill 5215 Statutory Interest + 5216 Statutory Late Fees for every
-- existing tenant. These are debited when recording a statutory challan
-- deposit that includes interest / late fee on top of the liability.
-- New tenants get them via the chart-of-accounts seed.

INSERT INTO accounts (tenant_id, code, name, type, parent_id, is_active, is_system_account)
SELECT
  t.id,
  '5215',
  'Statutory Interest',
  'expense'::account_type,
  (SELECT id FROM accounts WHERE tenant_id = t.id AND code = '5200' LIMIT 1),
  TRUE,
  FALSE
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM accounts a WHERE a.tenant_id = t.id AND a.code = '5215'
);

INSERT INTO accounts (tenant_id, code, name, type, parent_id, is_active, is_system_account)
SELECT
  t.id,
  '5216',
  'Statutory Late Fees',
  'expense'::account_type,
  (SELECT id FROM accounts WHERE tenant_id = t.id AND code = '5200' LIMIT 1),
  TRUE,
  FALSE
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM accounts a WHERE a.tenant_id = t.id AND a.code = '5216'
);
