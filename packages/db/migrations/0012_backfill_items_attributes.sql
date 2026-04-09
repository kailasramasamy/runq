-- 0012_backfill_items_attributes.sql
-- Populate items.attributes for rows written before Phase 1 / before
-- the item form's dual-write path was live. The Phase 1 form dual-writes
-- into both the legacy columns AND items.attributes, so items created
-- post-Phase-1 already have attributes populated. This migration only
-- touches rows where attributes is still NULL AND at least one legacy
-- column carries data.
--
-- The `jsonb_strip_nulls(jsonb_build_object(...))` pattern builds the
-- object from every column, then removes keys whose value was NULL —
-- so the result only contains keys for columns that actually had data.
-- That keeps the JSONB payload tight (no all-null orphan keys) and
-- matches what the Phase 1 form writes.
--
-- Idempotent: re-runs are safe because the WHERE clause only matches
-- rows that still have NULL attributes.

BEGIN;

UPDATE items
   SET attributes = jsonb_strip_nulls(jsonb_build_object(
     'brand',              brand,
     'productType',        product_type,
     'grammage',           grammage,
     'packingType',        packing_type,
     'vendorPackSize',     vendor_pack_size,
     'packagingDimension', packaging_dimension,
     'shelfLifeDays',      shelf_life_days,
     'temperature',        temperature,
     'cutoffTime',         cutoff_time,
     'rtvAllowed',         rtv_allowed
   )),
       updated_at = NOW()
 WHERE attributes IS NULL
   AND (
        brand                IS NOT NULL OR
        product_type         IS NOT NULL OR
        grammage             IS NOT NULL OR
        packing_type         IS NOT NULL OR
        vendor_pack_size     IS NOT NULL OR
        packaging_dimension  IS NOT NULL OR
        shelf_life_days      IS NOT NULL OR
        temperature          IS NOT NULL OR
        cutoff_time          IS NOT NULL OR
        rtv_allowed          IS NOT NULL
   );

COMMIT;
