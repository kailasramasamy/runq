-- 0009_items_extended_columns.sql
-- Extend items master with the columns we need to ingest supplier price
-- catalogues end-to-end (FMCG NPI sheets, etc.). Driven by the 4am-Fresh
-- NPI 2026-04-09 sheet which has Brand, Grammage, EAN, Margin, Basic Price,
-- GST Value, Shelf life, RTV, Vendor Pack Size, Packaging Dimension,
-- Temperature, Cut-off time, and Product Type as first-class columns.
--
-- All new columns are nullable so existing rows are unaffected.
-- Idempotent.

BEGIN;

ALTER TABLE items
  ADD COLUMN IF NOT EXISTS ean varchar(20),
  ADD COLUMN IF NOT EXISTS margin decimal(5, 2),
  ADD COLUMN IF NOT EXISTS brand varchar(100),
  ADD COLUMN IF NOT EXISTS grammage varchar(50),
  ADD COLUMN IF NOT EXISTS packing_type varchar(50),
  ADD COLUMN IF NOT EXISTS basic_price decimal(15, 2),
  ADD COLUMN IF NOT EXISTS gst_value decimal(15, 2),
  ADD COLUMN IF NOT EXISTS shelf_life_days integer,
  ADD COLUMN IF NOT EXISTS rtv_allowed boolean,
  ADD COLUMN IF NOT EXISTS vendor_pack_size varchar(50),
  ADD COLUMN IF NOT EXISTS packaging_dimension varchar(100),
  ADD COLUMN IF NOT EXISTS temperature varchar(20),
  ADD COLUMN IF NOT EXISTS cutoff_time varchar(20),
  ADD COLUMN IF NOT EXISTS product_type varchar(50);

-- EAN is the natural lookup key for FMCG catalogues; index it per tenant.
CREATE INDEX IF NOT EXISTS idx_items_tenant_ean
  ON items (tenant_id, ean)
  WHERE ean IS NOT NULL;

COMMIT;
