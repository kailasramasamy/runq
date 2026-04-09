-- 0008_price_list_items_min_qty_notnull.sql
-- Replace the expression-based unique index on price_list_items with a
-- regular column index. The COALESCE(min_quantity, 0) form from migration
-- 0002 broke `drizzle-kit push` introspection (it can't represent expression
-- columns in its Zod schema), which crashed the API container on startup.
--
-- Fix: make min_quantity NOT NULL DEFAULT 0 so the "base price" row sits at
-- min_quantity=0 instead of NULL, then build the unique index on plain
-- columns. Semantics are preserved — the base tier just has an explicit 0.
--
-- Idempotent.

BEGIN;

-- Backfill any existing NULLs to 0 (the implicit base tier).
UPDATE price_list_items
   SET min_quantity = 0
 WHERE min_quantity IS NULL;

ALTER TABLE price_list_items
  ALTER COLUMN min_quantity SET DEFAULT 0;

ALTER TABLE price_list_items
  ALTER COLUMN min_quantity SET NOT NULL;

-- Swap the expression index for a plain column index of the same name.
DROP INDEX IF EXISTS uq_price_list_items_list_item_qty;

CREATE UNIQUE INDEX IF NOT EXISTS uq_price_list_items_list_item_qty
  ON price_list_items (price_list_id, item_id, min_quantity);

COMMIT;
