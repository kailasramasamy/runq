-- 0116_vendor_bill_item_aliases_to_catalog.sql
--
-- AP Pattern-B (spec §2.5): retire `vendor_bill_item_aliases`. Its data
-- folds into the new `vendor_catalog_items` table so we have one
-- per-vendor catalog instead of two parallel concepts.
--
-- Mapping (per existing alias row):
--   raw_description       → description
--   normalized_key        → normalized_description
--   suggested_hsn_sac     → hsn_sac_code
--   suggested_tax_rate    → default_tax_rate
--   suggested_tax_category → default_tax_category
--   use_count             → use_count
--   last_used_at          → last_used_at
--   created_at            → created_at
--
-- `default_uom` and `default_rate` stay NULL — the legacy alias table
-- never stored them. `inventory_item_id` also NULL — alias rows had no
-- inventory-master linkage; the user maps that explicitly later.
--
-- Anti-join INSERT is used (not ON CONFLICT) because the new table's
-- uniqueness is a *partial* index (WHERE is_active = true) which
-- ON CONFLICT can't target by inferred constraint.
--
-- After backfill, the legacy table is dropped. The application code is
-- updated in the same commit so the runtime never references the dropped
-- table.
--
-- Idempotent via the migration tracker — re-runs no-op.

BEGIN;

-- Safety: only attempt backfill if the legacy table still exists.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'vendor_bill_item_aliases'
  ) THEN
    INSERT INTO vendor_catalog_items (
      tenant_id,
      vendor_id,
      description,
      normalized_description,
      hsn_sac_code,
      default_tax_rate,
      default_tax_category,
      use_count,
      last_used_at,
      is_active,
      created_at,
      updated_at
    )
    SELECT
      a.tenant_id,
      a.vendor_id,
      a.raw_description,
      a.normalized_key,
      a.suggested_hsn_sac,
      a.suggested_tax_rate,
      a.suggested_tax_category,
      COALESCE(a.use_count, 1),
      a.last_used_at,
      true,
      a.created_at,
      now()
    FROM vendor_bill_item_aliases a
    WHERE NOT EXISTS (
      SELECT 1 FROM vendor_catalog_items vci
      WHERE vci.tenant_id = a.tenant_id
        AND vci.vendor_id = a.vendor_id
        AND vci.normalized_description = a.normalized_key
        AND vci.is_active = true
    );

    DROP TABLE vendor_bill_item_aliases;
  END IF;
END$$;

COMMIT;
