-- 0112_backfill_missing_categories.sql
--
-- Backfill follow-up to 0111. The previous migration matched items to the
-- existing `categories` rows, but ~half the items use free-text category
-- names that were never created in the categories table (typical of
-- pre-tree imports). This migration:
--   1. Inserts a parent row for every distinct (tenant, category) string
--      that isn't already in categories.
--   2. Inserts a child row for every distinct (tenant, category, subcat)
--      string that isn't already in categories.
--   3. Re-runs the items.category_id backfill so previously-unmatched
--      rows get linked.
--
-- Idempotent: safe to re-run.

BEGIN;

-- 1. Parent backfill --------------------------------------------------------
INSERT INTO categories (tenant_id, name, parent_id, is_active)
SELECT DISTINCT i.tenant_id, i.category, NULL::uuid, true
FROM items i
WHERE i.category IS NOT NULL AND i.category <> ''
  AND NOT EXISTS (
    SELECT 1 FROM categories c
    WHERE c.tenant_id = i.tenant_id
      AND c.parent_id IS NULL
      AND c.name = i.category
  );

-- 2. Child backfill ---------------------------------------------------------
INSERT INTO categories (tenant_id, name, parent_id, is_active)
SELECT DISTINCT i.tenant_id, i.subcategory, p.id, true
FROM items i
JOIN categories p
  ON p.tenant_id = i.tenant_id
 AND p.parent_id IS NULL
 AND p.name = i.category
WHERE i.subcategory IS NOT NULL AND i.subcategory <> ''
  AND NOT EXISTS (
    SELECT 1 FROM categories c
    WHERE c.tenant_id = i.tenant_id
      AND c.parent_id = p.id
      AND c.name = i.subcategory
  );

-- 3. Re-link items ----------------------------------------------------------
-- Leaf match first
UPDATE items i SET category_id = sub.id
FROM categories sub
JOIN categories par ON par.id = sub.parent_id
WHERE i.category_id IS NULL
  AND i.tenant_id = sub.tenant_id
  AND par.tenant_id = i.tenant_id
  AND par.parent_id IS NULL
  AND sub.name = i.subcategory
  AND par.name = i.category;

-- Parent fallback
UPDATE items i SET category_id = par.id
FROM categories par
WHERE i.category_id IS NULL
  AND i.tenant_id = par.tenant_id
  AND par.parent_id IS NULL
  AND par.name = i.category;

COMMIT;
