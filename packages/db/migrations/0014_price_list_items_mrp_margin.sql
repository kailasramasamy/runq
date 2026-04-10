-- 0014_price_list_items_mrp_margin.sql
-- Make per-customer pricing express both margin% and MRP overrides, not just
-- absolute rates. Three changes:
--
-- 1. Add `mrp` column on price_list_items so a price list line can override
--    the maximum retail price for a given (customer, item) combination
--    independently of the selling rate.
--
-- 2. Drop NOT NULL on `rate`. The line can now express *only* a margin%
--    (rate is derived at resolve-time from items.cost_price) or *only* an
--    MRP override (rate falls through to the item default).
--
-- 3. Add a CHECK constraint that at least one of (rate, margin_percent, mrp)
--    is set, so empty lines can't be persisted.
--
-- Idempotent.

BEGIN;

ALTER TABLE price_list_items
  ADD COLUMN IF NOT EXISTS mrp decimal(15, 2);

ALTER TABLE price_list_items
  ALTER COLUMN rate DROP NOT NULL;

-- Drop the constraint first if it already exists, so the migration is rerunnable.
ALTER TABLE price_list_items
  DROP CONSTRAINT IF EXISTS price_list_items_at_least_one_value;

ALTER TABLE price_list_items
  ADD CONSTRAINT price_list_items_at_least_one_value
  CHECK (rate IS NOT NULL OR margin_percent IS NOT NULL OR mrp IS NOT NULL);

COMMIT;
