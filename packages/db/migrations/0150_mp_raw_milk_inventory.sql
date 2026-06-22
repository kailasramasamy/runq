-- 0150_mp_raw_milk_inventory.sql
--
-- P1.2 — the traceability link: PP tanker receipt posts a raw-milk batch into
-- the inventory `stock_ledger`, so the chain farmer pour → VMCC → CC → PP intake
-- → raw-milk stock → manufacturing is unbroken.
--
-- Decisions (dhenu-schema-spec §9.4): one inventory ITEM per milk type
-- (mp_raw_milk_items map), a SINGLE tenant raw-milk WAREHOUSE
-- (mp_gl_settings.raw_milk_warehouse_id), valued at ZERO for now — the GL
-- journal + real valuation arrive with P1.1 at payout lock. Posting is
-- best-effort: a receive never fails if the map/warehouse isn't configured yet.
--
-- milk_type rides on the consignment now (derived from the source's actual
-- composition: single-type source → that type, mixed → NULL → 'mixed' item).
--
-- Apply in native dev via scripts/run-sql.ts (drizzle-kit push is the prod path).

BEGIN;

-- milk type carried by the consignment (nullable; NULL = mixed/unsegregated)
ALTER TABLE mp_consignments
  ADD COLUMN IF NOT EXISTS milk_type mp_milk_type;

-- the single raw-milk warehouse all PP receipts post into
ALTER TABLE mp_gl_settings
  ADD COLUMN IF NOT EXISTS raw_milk_warehouse_id uuid REFERENCES warehouses(id);

-- per-milk-type → inventory item map (one item per type)
CREATE TABLE IF NOT EXISTS mp_raw_milk_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id),
  milk_type  mp_milk_type NOT NULL,
  item_id    uuid NOT NULL REFERENCES items(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mp_raw_milk_items
  ON mp_raw_milk_items (tenant_id, milk_type);

COMMIT;
