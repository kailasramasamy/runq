-- Per-farmer disbursement tracking on payout lines. Operational flag the VMCC
-- operator toggles as each farmer is handed cash/UPI; independent of the
-- cycle-level Lock→Pay GL posting.
ALTER TABLE mp_payout_lines
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_by uuid REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_mp_payout_lines_paid
  ON mp_payout_lines (tenant_id, payout_cycle_id, paid_at);
