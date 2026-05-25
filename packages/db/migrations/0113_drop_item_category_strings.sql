-- 0113_drop_item_category_strings.sql
--
-- Phase 3 of the items axis-2 rollout. Removes the legacy denormalized
-- category strings now that every reader has been migrated to either
--   • items.category_id directly, or
--   • a join through the categories tree.
--
-- Audit checked (no remaining readers as of this migration):
--   • apps/api/src/modules/masters/item.service.ts   — toItem() derives
--     category / subcategory from a categories alias join.
--   • apps/api/src/modules/masters/price-list.service.ts — joins categories
--     for the line-item shape + order-by.
--   • apps/api/src/modules/inventory/reports.service.ts — joins categories
--     for stockSummary + valuation rollups.
--   • apps/api/src/modules/inventory/stock-take.service.ts — filters by
--     category_id, not the name string.
--   • Finance modules never read these columns (per the earlier audit).
--
-- The mobile + web clients keep working because the API contract still
-- exposes `category` / `subcategory` on the Item shape — those are now
-- computed at SELECT time from the joined category tree.

BEGIN;

-- Trigger + function are obsolete once the columns disappear.
DROP TRIGGER IF EXISTS trg_items_sync_category_strings ON items;
DROP FUNCTION IF EXISTS items_sync_category_strings();

-- Drop the columns themselves.
ALTER TABLE items
  DROP COLUMN IF EXISTS category,
  DROP COLUMN IF EXISTS subcategory;

COMMIT;
