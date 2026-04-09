-- 0002_price_list_enhancements.sql
-- Two changes that make per-customer pricing actually work:
--
-- 1. Add customers.customer_group so the price_lists.applyTo='customer_group'
--    targeting variant can match a real value on the customer record.
--
-- 2. Replace the unique constraint on price_list_items so a single price list
--    can hold multiple tiers per item (different rates at different minQty).
--    Without this, qty-tier pricing was impossible.
--
-- Both changes are idempotent.

BEGIN;

-- 1. Customer group column
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS customer_group varchar(50);

CREATE INDEX IF NOT EXISTS idx_customers_tenant_group
  ON customers (tenant_id, customer_group);

-- 2. Allow tier pricing on price_list_items
-- The old unique index was on (price_list_id, item_id) — only one row per item.
-- We replace it with one that includes COALESCE(min_quantity, 0), so multiple
-- rows per item with different qty thresholds are allowed.
DROP INDEX IF EXISTS uq_price_list_items_list_item;

CREATE UNIQUE INDEX IF NOT EXISTS uq_price_list_items_list_item_qty
  ON price_list_items (price_list_id, item_id, COALESCE(min_quantity, 0));

COMMIT;
