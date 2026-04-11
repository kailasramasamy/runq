-- Add GL account link to bank accounts (replaces hardcoded '1101')
ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS gl_account_id UUID REFERENCES accounts(id);

-- Backfill: link existing bank accounts to their tenant's '1101' account
UPDATE bank_accounts ba SET gl_account_id = (
  SELECT id FROM accounts WHERE code = '1101' AND tenant_id = ba.tenant_id LIMIT 1
) WHERE gl_account_id IS NULL;

-- Add journal entry link to bank transactions
ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS journal_entry_id UUID REFERENCES journal_entries(id);
CREATE INDEX IF NOT EXISTS idx_bt_journal_entry ON bank_transactions(journal_entry_id);
