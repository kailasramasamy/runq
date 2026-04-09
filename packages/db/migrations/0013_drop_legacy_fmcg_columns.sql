-- 0013_drop_legacy_fmcg_columns.sql
-- Drop the 10 FMCG-specific columns now that every read path and write
-- path uses items.attributes (JSONB) instead. Data for existing rows
-- was backfilled into items.attributes by 0012_backfill_items_attributes.sql
-- — running this migration without 0012 first WILL lose data.
--
-- Columns preserved (universal / not FMCG): ean, margin, basic_price,
-- gst_value, cogm_breakdown, attributes.
--
-- Destructive and irreversible. IF EXISTS is belt-and-braces so a
-- partial re-run doesn't error.

BEGIN;

ALTER TABLE items
  DROP COLUMN IF EXISTS brand,
  DROP COLUMN IF EXISTS product_type,
  DROP COLUMN IF EXISTS grammage,
  DROP COLUMN IF EXISTS packing_type,
  DROP COLUMN IF EXISTS vendor_pack_size,
  DROP COLUMN IF EXISTS packaging_dimension,
  DROP COLUMN IF EXISTS shelf_life_days,
  DROP COLUMN IF EXISTS temperature,
  DROP COLUMN IF EXISTS cutoff_time,
  DROP COLUMN IF EXISTS rtv_allowed;

COMMIT;
