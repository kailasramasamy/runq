-- 0006_invoice_item_id.sql
-- Link sales invoice line items back to the items master so the edit form
-- can restore the item picker, the PO Inbox approve flow can persist the
-- matched item, and downstream reports can group by SKU.
--
-- Nullable + ON DELETE SET NULL so:
--   1. Ad-hoc lines without a master item still work
--   2. Deleting a master item later doesn't cascade-delete invoice history
-- Idempotent.

BEGIN;

ALTER TABLE sales_invoice_items
  ADD COLUMN IF NOT EXISTS item_id uuid REFERENCES items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sii_item_id
  ON sales_invoice_items (item_id)
  WHERE item_id IS NOT NULL;

COMMIT;
