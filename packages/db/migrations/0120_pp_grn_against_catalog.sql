-- PP Phase 3 follow-up — GRN lines against vendor catalog, not items master.
--
-- Until now, every inventory_grn_lines row mapped to items.id (the FG-only
-- items master). The PP receive flow forced a Map-to-item step that was
-- architecturally wrong: vendor-procured consumables live in
-- vendor_catalog_items, and only a subset bridge to inventory tracking
-- via vendor_catalog_items.inventory_item_id.
--
-- Net schema change:
--   1. Add catalog_item_id (nullable FK → vendor_catalog_items).
--   2. Drop NOT NULL on item_id.
--   3. Enforce: exactly one of (item_id, catalog_item_id) is set.
--
-- Existing rows (bill-inline GRNs, direct receipts) keep item_id and a
-- NULL catalog_item_id. New PO-receive rows will write catalog_item_id
-- and only populate item_id when the catalog row has an inventory bridge.

ALTER TABLE inventory_grn_lines
  ADD COLUMN catalog_item_id uuid REFERENCES vendor_catalog_items(id);

ALTER TABLE inventory_grn_lines
  ALTER COLUMN item_id DROP NOT NULL;

ALTER TABLE inventory_grn_lines
  ADD CONSTRAINT inv_grn_lines_item_or_catalog CHECK (
    (item_id IS NOT NULL)::int + (catalog_item_id IS NOT NULL)::int = 1
  );

CREATE INDEX idx_inv_grn_lines_catalog
  ON inventory_grn_lines (tenant_id, catalog_item_id)
  WHERE catalog_item_id IS NOT NULL;
