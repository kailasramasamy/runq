-- 0005_invoice_item_uom.sql
-- Add unit-of-measure to sales_invoice_items so kg/L/pcs/etc. can render
-- alongside quantity on the invoice detail page. Populated by the PO Inbox
-- approve flow (from items.unit) and any future manual invoice form update.
-- Idempotent.

BEGIN;

ALTER TABLE sales_invoice_items
  ADD COLUMN IF NOT EXISTS uom varchar(20);

COMMIT;
