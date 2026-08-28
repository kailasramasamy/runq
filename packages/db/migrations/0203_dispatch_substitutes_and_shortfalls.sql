-- Sales substitution, and making a stock shortfall something you can see.
--
-- Auto-dispatch already splits a short invoice line: what the warehouse can
-- cover posts, the remainder is parked on a draft DN. But that draft was only
-- distinguishable by a notes string, so nobody found it — the shortage
-- surfaced as a transient toast at invoice issue and then went quiet, and the
-- van left with a substitute nobody recorded.
--
-- Two halves. `is_shortfall` makes the parked remainder a queryable thing, so
-- it can be listed, aged and alerted on. `item_substitutes` plus the two DN
-- line columns let the substitute that actually went on the van be dispatched
-- as itself — drawing its own stock, at its own cost — while still clearing
-- the invoice line it was sent against.
CREATE TABLE IF NOT EXISTS item_substitutes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  substitute_item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  priority INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT uq_item_subs_item_sub UNIQUE (item_id, substitute_item_id),
  -- An item substituting for itself would let the picker offer the very SKU
  -- that just ran out.
  CONSTRAINT chk_item_subs_not_self CHECK (item_id <> substitute_item_id)
);

CREATE INDEX IF NOT EXISTS idx_item_subs_item ON item_substitutes (tenant_id, item_id);

-- Deliberately not symmetric: A2 standing in for Farm Fresh is a downgrade the
-- customer accepts, the reverse gives away margin. Declare each direction you
-- actually want offered.
COMMENT ON TABLE item_substitutes IS
  'Items that may be dispatched in place of item_id. One-directional by design.';

ALTER TABLE delivery_note_lines
  ADD COLUMN IF NOT EXISTS substituted_for_item_id UUID REFERENCES items(id),
  ADD COLUMN IF NOT EXISTS substitution_note TEXT;

COMMENT ON COLUMN delivery_note_lines.substituted_for_item_id IS
  'Set when item_id differs from the item its invoice line billed. The line
   draws and costs its own item; this records what it was sent against.';

ALTER TABLE delivery_notes
  ADD COLUMN IF NOT EXISTS is_shortfall BOOLEAN NOT NULL DEFAULT false;

-- Partial: the shortages queue only ever asks for open ones, and shortfall
-- drafts are a thin slice of the table.
CREATE INDEX IF NOT EXISTS idx_dn_open_shortfall
  ON delivery_notes (tenant_id, dispatch_date)
  WHERE is_shortfall = true AND status = 'draft';

-- Backfill the drafts auto-dispatch already parked, which are identifiable
-- only by the note it stamped on them.
UPDATE delivery_notes
   SET is_shortfall = true
 WHERE status = 'draft'
   AND notes LIKE 'Auto-dispatch shortfall%';
