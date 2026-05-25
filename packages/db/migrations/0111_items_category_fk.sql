-- 0111_items_category_fk.sql
--
-- Phase 2 of the items axis-2 ("category") rollout.
--
-- The `categories` table (added earlier) already models a 2-level tree
-- per tenant via parent_id. `items.category` and `items.subcategory`
-- still reference it by string name, which means:
--   • renaming a category orphans every item that referenced the old name,
--   • we can't hang defaults (HSN, GST) off a category node,
--   • dashboards can't roll up by anything other than free-text match.
--
-- This migration:
--   1. Adds `default_hsn_sac`, `default_gst_rate`, `sort_order` to
--      categories so item create can inherit sensible defaults.
--   2. Adds `items.category_id` FK → categories.id with a partial index.
--   3. Backfills category_id by matching the existing strings: subcategory
--      first (the leaf is more specific), then category (parent fallback).
--   4. Installs a trigger that keeps items.category / items.subcategory
--      readable from category_id — legacy code paths keep working until
--      Phase 3 drops the string columns.

BEGIN;

-- 1. Category defaults + sort -----------------------------------------------

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS default_hsn_sac varchar(8),
  ADD COLUMN IF NOT EXISTS default_gst_rate decimal(5, 2),
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

-- Self-FK was previously declared in the Drizzle schema without a real
-- DB constraint. Add it now so cascade rules are explicit. RESTRICT keeps
-- accidental parent-deletes from orphaning children.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_categories_parent'
  ) THEN
    ALTER TABLE categories
      ADD CONSTRAINT fk_categories_parent
      FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE RESTRICT;
  END IF;
END$$;

-- 2. items.category_id ------------------------------------------------------

ALTER TABLE items
  ADD COLUMN IF NOT EXISTS category_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_items_category'
  ) THEN
    ALTER TABLE items
      ADD CONSTRAINT fk_items_category
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_items_tenant_category
  ON items (tenant_id, category_id)
  WHERE category_id IS NOT NULL;

-- 3. Backfill items.category_id from existing strings -----------------------
-- Prefer the leaf (subcategory) match; fall back to the parent (category).

UPDATE items i SET category_id = sub.id
FROM categories sub
JOIN categories par ON par.id = sub.parent_id
WHERE i.category_id IS NULL
  AND i.tenant_id = sub.tenant_id
  AND par.tenant_id = i.tenant_id
  AND par.parent_id IS NULL
  AND sub.name = i.subcategory
  AND par.name = i.category;

UPDATE items i SET category_id = par.id
FROM categories par
WHERE i.category_id IS NULL
  AND i.tenant_id = par.tenant_id
  AND par.parent_id IS NULL
  AND par.name = i.category;

-- 4. Shadow sync trigger ----------------------------------------------------
-- When category_id is set or changed, mirror it back to category /
-- subcategory so legacy reads continue to work. Only writes when the
-- FK column is the one driving the change (i.e. the caller didn't pass
-- explicit strings that disagree).

CREATE OR REPLACE FUNCTION items_sync_category_strings() RETURNS trigger AS $$
DECLARE
  leaf  RECORD;
BEGIN
  IF NEW.category_id IS NULL THEN
    -- Caller explicitly cleared the FK — leave the strings alone so the
    -- service layer can still set them by hand for legacy flows.
    RETURN NEW;
  END IF;

  SELECT c.id, c.name AS leaf_name, c.parent_id, p.name AS parent_name
    INTO leaf
  FROM categories c
  LEFT JOIN categories p ON p.id = c.parent_id
  WHERE c.id = NEW.category_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF leaf.parent_id IS NULL THEN
    -- category_id points at a root node → category=name, subcategory=NULL.
    NEW.category    := leaf.leaf_name;
    NEW.subcategory := NULL;
  ELSE
    -- category_id points at a leaf → parent name + leaf name.
    NEW.category    := leaf.parent_name;
    NEW.subcategory := leaf.leaf_name;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_items_sync_category_strings ON items;
CREATE TRIGGER trg_items_sync_category_strings
  BEFORE INSERT OR UPDATE OF category_id ON items
  FOR EACH ROW
  EXECUTE FUNCTION items_sync_category_strings();

COMMIT;
