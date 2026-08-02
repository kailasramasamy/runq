-- Sales stock movement — invoice-driven dispatch + sales returns.
--
-- Finished goods leave stock through exactly one document: the delivery note.
-- Until now a DN could only be keyed in by hand, and an AR invoice never
-- touched inventory at all — so producing FG and invoicing it left on-hand
-- untouched. This wires the invoice as a second intake lane into the same
-- document, and adds the inbound (return) direction.
--
-- 1. delivery_note_lines.invoice_line_id — per-line link to the invoice line.
--    This is what makes "dispatched qty vs invoiced qty" computable, so an
--    invoice can be partially dispatched and can't be over-dispatched.
-- 2. delivery_notes.invoice_id index — the column already existed but was
--    never written; the dispatch queue filters on it.
-- 3. Return direction on delivery_notes. A sales return is the inverse of a
--    dispatch and reuses the whole DN stack (service, batches, GL reversal)
--    rather than a parallel document type. return_of_dn_id is required for
--    returns so the inbound cost is the original dispatch cost, never
--    re-derived — that is what keeps valuation from drifting.
-- 4. sales_return_in stock movement type.

ALTER TABLE delivery_note_lines
  ADD COLUMN IF NOT EXISTS invoice_line_id UUID REFERENCES sales_invoice_items(id);

CREATE INDEX IF NOT EXISTS idx_dnl_invoice_line
  ON delivery_note_lines (invoice_line_id);

CREATE INDEX IF NOT EXISTS idx_dn_tenant_invoice
  ON delivery_notes (tenant_id, invoice_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'delivery_note_direction') THEN
    CREATE TYPE delivery_note_direction AS ENUM ('out', 'in');
  END IF;
END
$$;

ALTER TABLE delivery_notes
  ADD COLUMN IF NOT EXISTS direction delivery_note_direction NOT NULL DEFAULT 'out';

ALTER TABLE delivery_notes
  ADD COLUMN IF NOT EXISTS credit_note_id UUID REFERENCES credit_notes(id);

ALTER TABLE delivery_notes
  ADD COLUMN IF NOT EXISTS return_of_dn_id UUID REFERENCES delivery_notes(id);

CREATE INDEX IF NOT EXISTS idx_dn_tenant_direction
  ON delivery_notes (tenant_id, direction);

CREATE INDEX IF NOT EXISTS idx_dn_return_of
  ON delivery_notes (return_of_dn_id);

ALTER TYPE stock_movement_type ADD VALUE IF NOT EXISTS 'sales_return_in';
