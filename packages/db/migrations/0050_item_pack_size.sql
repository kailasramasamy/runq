-- Add pack_size to items master so GSTR-1 HSN summary can normalize
-- multi-variant SKUs to a canonical UQC.
--
-- Context: April 2026 filing surfaced that variants of the same product
-- (e.g. Sunflower Oil 100ml/250ml/500ml/1L) were summed as raw quantities
-- regardless of pack size, producing nonsense HSN totals. The fix is to
-- store the pack size on each item and let the GSTR-1 generator convert
-- to a canonical UQC per HSN bucket (LTR for chapter 04 milk + chapter 15
-- oils, KGS for solids, etc.).
--
-- pack_size_value: numeric in pack_size_uqc units (e.g. 100, 0.5, 1).
-- pack_size_uqc:   GSTN UQC code the value is expressed in (ML, LTR, GMS, KGS, NOS, …).
-- Backfill defaults so existing behavior is unchanged: pack_size 1 in the
-- item's current `unit`, falling back to NOS when unit is null.
ALTER TABLE items
  ADD COLUMN IF NOT EXISTS pack_size_value numeric(12, 4) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS pack_size_uqc varchar(10);

UPDATE items
   SET pack_size_uqc = COALESCE(NULLIF(unit, ''), 'NOS')
 WHERE pack_size_uqc IS NULL;

ALTER TABLE items
  ALTER COLUMN pack_size_uqc SET NOT NULL;

-- Same on sales_invoice_items so ad-hoc lines (no item_id, e.g. CSV-
-- imported aggregate sales) can carry their own pack-size for GSTR-1.
ALTER TABLE sales_invoice_items
  ADD COLUMN IF NOT EXISTS pack_size_value numeric(12, 4) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS pack_size_uqc varchar(10);
