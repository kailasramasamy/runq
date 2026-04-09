-- 0007_customer_default_bank.sql
-- Designate a specific bank account to each customer so invoice PDFs only
-- expose the chosen account, not the full list (which would otherwise leak
-- petty cash + all internal accounts to every customer).
--
-- Nullable + ON DELETE SET NULL — deleting a bank account leaves customers
-- intact and they fall back to the tenant default. Idempotent.

BEGIN;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS default_bank_account_id uuid REFERENCES bank_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_customers_tenant_default_bank
  ON customers (tenant_id, default_bank_account_id)
  WHERE default_bank_account_id IS NOT NULL;

COMMIT;
