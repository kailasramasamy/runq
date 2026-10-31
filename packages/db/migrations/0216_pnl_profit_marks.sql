-- Internal P&L: entries booked as an expense for the official books that the
-- owner counts as profit taken out. One row per (journal entry, account) — the
-- unit the monthly P&L drill-down lists. The GL itself is never changed; a
-- re-posted entry drops its mark with it (cascade), so the mark can't block it.
CREATE TABLE IF NOT EXISTS pnl_profit_marks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  journal_entry_id uuid NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES accounts(id),
  marked_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, journal_entry_id, account_id)
);
