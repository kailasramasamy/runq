-- Add 1116 "Bank Suspense" account for every existing tenant.
-- Used by the bank reconciliation flow as a fallback when an unmatched
-- debit can't be categorized (no vendor, no rule, no AI match) — books
-- stay tied to the bank instead of leaving the cash side unposted.

INSERT INTO accounts (tenant_id, code, name, type, parent_id, is_system_account)
SELECT
  parent.tenant_id,
  '1116',
  'Bank Suspense',
  'asset'::account_type,
  parent.id,
  TRUE
FROM accounts parent
WHERE parent.code = '1100'
  AND NOT EXISTS (
    SELECT 1 FROM accounts existing
    WHERE existing.tenant_id = parent.tenant_id
      AND existing.code = '1116'
  );
