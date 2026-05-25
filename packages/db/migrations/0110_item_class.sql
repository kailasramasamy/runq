-- 0110_item_class.sql
--
-- Phase 1 of the items axis-1 ("item class") rollout.
--
-- Adds a small, fixed enum that classifies inventoried items by purpose
-- (raw material, finished good, spare part, …) so that:
--   • the item create service can seed sensible defaults for trackBatches
--     / trackExpiry per class,
--   • future phases can route GL postings per class (consumables → expense,
--     spares → repairs & maintenance, etc.) without needing a per-item map.
--
-- Notes on the existing schema:
--   • `items.type` is already a `('product' | 'service')` enum and is used
--     everywhere — we DO NOT rename it. The new column is `item_class`.
--   • All existing products are backfilled to 'trading_good' as the safest
--     default. Tenants reclassify manually via the item edit screen.
--   • Services keep item_class NULL — the CHECK only fires for products.
--
-- This migration is additive and does not touch any existing column.

BEGIN;

-- 1. Enum --------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'item_class') THEN
    CREATE TYPE item_class AS ENUM (
      'raw_material',
      'packaging',
      'finished_good',
      'semi_finished',
      'trading_good',
      'consumable',
      'spare_part'
    );
  END IF;
END$$;

-- 2. Column ------------------------------------------------------------------

ALTER TABLE items
  ADD COLUMN IF NOT EXISTS item_class item_class;

-- 3. Backfill ----------------------------------------------------------------
-- Every existing product → 'trading_good'. Services stay NULL.

UPDATE items
SET item_class = 'trading_good'
WHERE type = 'product'
  AND item_class IS NULL;

-- 4. Constraint --------------------------------------------------------------
-- Products MUST carry an item_class; services MUST NOT (kept NULL so the
-- enum stays small and unambiguous for inventoried items).

ALTER TABLE items
  DROP CONSTRAINT IF EXISTS chk_items_item_class_present;

ALTER TABLE items
  ADD CONSTRAINT chk_items_item_class_present
  CHECK (
    (type = 'product' AND item_class IS NOT NULL)
    OR
    (type = 'service' AND item_class IS NULL)
  );

-- 5. Index for filter/rollup queries ----------------------------------------

CREATE INDEX IF NOT EXISTS idx_items_tenant_class
  ON items (tenant_id, item_class)
  WHERE item_class IS NOT NULL;

COMMIT;
