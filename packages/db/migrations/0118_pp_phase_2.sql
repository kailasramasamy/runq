-- 0118_pp_phase_2.sql
--
-- PP Phase 2: Receive against PO. Spec: docs/purchase-procurement-plan.md §4.4 + §5.2.
--
-- Changes:
--   1. inventory_grn_lines.po_line_id — nullable FK to purchase_order_lines_v2.
--      Lets the receive flow tie individual GRN lines back to the PO line they
--      fulfil. Allows partial receipts (qty < ordered) and split receipts
--      (one PO line → many GRN lines across deliveries).
--   2. inventory_grns.po_id FK — currently a bare uuid column (migration 0114
--      added bill_id FK + source discriminator but left po_id without a FK).
--      Add the FK now that purchase_orders_v2 exists.
--
-- Both additions are NULLABLE so existing GRN rows (source='direct' / 'bill')
-- are unaffected. The CHECK constraint on inventory_grns.source (added in
-- 0114) already enforces that source='po' implies po_id IS NOT NULL.

BEGIN;

-- 1. inventory_grn_lines.po_line_id ─────────────────────────────────────

ALTER TABLE inventory_grn_lines
  ADD COLUMN IF NOT EXISTS po_line_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inv_grn_line_po_line_fk'
  ) THEN
    ALTER TABLE inventory_grn_lines
      ADD CONSTRAINT inv_grn_line_po_line_fk
      FOREIGN KEY (po_line_id) REFERENCES purchase_order_lines_v2(id);
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_inv_grn_lines_po_line
  ON inventory_grn_lines (po_line_id)
  WHERE po_line_id IS NOT NULL;

-- 2. inventory_grns.po_id FK ─────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inv_grn_po_v2_fk'
  ) THEN
    ALTER TABLE inventory_grns
      ADD CONSTRAINT inv_grn_po_v2_fk
      FOREIGN KEY (po_id) REFERENCES purchase_orders_v2(id);
  END IF;
END$$;

COMMIT;
