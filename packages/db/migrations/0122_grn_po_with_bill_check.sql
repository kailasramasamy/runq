-- PP Phase 5 (part 2/2): rewire CHECK + add variance snapshot columns.
--
-- Pairs with 0121. Replaces chk_inv_grn_source_linkage so 'po_with_bill'
-- requires BOTH po_id and bill_id, and snapshots PO qty/rate per GRN line
-- so variance reports later don't have to chase PO mutations.

-- 1. CHECK constraint --------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_inv_grn_source_linkage') THEN
    ALTER TABLE inventory_grns DROP CONSTRAINT chk_inv_grn_source_linkage;
  END IF;

  ALTER TABLE inventory_grns
    ADD CONSTRAINT chk_inv_grn_source_linkage CHECK (
      (source = 'po'           AND po_id   IS NOT NULL AND bill_id IS NULL)     OR
      (source = 'bill'         AND bill_id IS NOT NULL AND po_id   IS NULL)     OR
      (source = 'po_with_bill' AND po_id   IS NOT NULL AND bill_id IS NOT NULL) OR
      (source = 'direct'       AND po_id   IS NULL     AND bill_id IS NULL)
    ) NOT VALID;
END$$;

-- 2. Variance snapshot columns on GRN lines ---------------------------------
ALTER TABLE inventory_grn_lines
  ADD COLUMN IF NOT EXISTS is_off_po       BOOLEAN        NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS po_unit_rate    DECIMAL(18, 2),
  ADD COLUMN IF NOT EXISTS po_qty_ordered  DECIMAL(18, 3);

COMMENT ON COLUMN inventory_grn_lines.is_off_po IS
  'Vendor invoice line that has no corresponding PO line (substitution / extra).';
COMMENT ON COLUMN inventory_grn_lines.po_unit_rate IS
  'PO line unit_rate at receive time. NULL for off-PO or non-PO GRNs.';
COMMENT ON COLUMN inventory_grn_lines.po_qty_ordered IS
  'PO line qty_ordered at receive time. NULL for off-PO or non-PO GRNs.';

-- 3. Reporting index for off-PO lines --------------------------------------
CREATE INDEX IF NOT EXISTS idx_inv_grn_lines_off_po
  ON inventory_grn_lines (tenant_id, grn_id)
  WHERE is_off_po = TRUE;
