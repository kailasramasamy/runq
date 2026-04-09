-- 0011_items_attributes.sql
-- Add a flexible JSONB `attributes` column to items so the catalogue can
-- capture industry-specific fields (apparel: size/color, pharma: schedule,
-- manufacturing: grade/tolerance, etc.) without bloating the table with
-- more dedicated columns.
--
-- The existing FMCG columns (grammage, packing_type, shelf_life_days, …)
-- stay for now. During Phase 1, FMCG tenants dual-write values into both
-- the matching column AND the attributes JSON so existing list views,
-- CSV exports, and AI extraction keep working unchanged.
--
-- Idempotent.

BEGIN;

ALTER TABLE items
  ADD COLUMN IF NOT EXISTS attributes jsonb;

COMMIT;
