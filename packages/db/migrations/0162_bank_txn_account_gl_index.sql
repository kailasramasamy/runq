-- Index backing the per-account financial report's category grouping
-- (bank_transactions grouped by gl_account_id within one bank account).
CREATE INDEX IF NOT EXISTS idx_bt_tenant_account_gl
  ON bank_transactions (tenant_id, bank_account_id, gl_account_id);
