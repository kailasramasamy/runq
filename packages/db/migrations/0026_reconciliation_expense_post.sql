-- Add expense_post match type and journal_entry_id column for direct expense posting from reconciliation
ALTER TYPE recon_match_type ADD VALUE IF NOT EXISTS 'expense_post';

ALTER TABLE reconciliation_matches ADD COLUMN IF NOT EXISTS journal_entry_id UUID REFERENCES journal_entries(id);

CREATE INDEX IF NOT EXISTS idx_rm_journal_entry_id ON reconciliation_matches (journal_entry_id);
