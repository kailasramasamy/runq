-- 0114_ap_pattern_b_schema.sql
--
-- AP Pattern-B foundation. Spec: docs/ap-pattern-b-spec.md.
--
-- The dominant Indian-SME procurement pattern is "goods + invoice arrive
-- together, no PO." Today AP creates a bill and posts a JE but bill lines
-- never touch inventory — so milk lands on `5001 Raw Material Purchases`
-- (P&L) instead of `1201 Raw Material Inventory` (asset), breaking future
-- FG costing in Manufacturing.
--
-- This migration adds the schema needed so that a single bill-post
-- transaction can optionally:
--   1. record qty into stock_ledger / stock_on_hand for tracked items,
--   2. inline-create a GRN linked to the bill (with idempotency),
--   3. route the JE per item class (Dr Inventory vs Dr Expense).
--
-- Architectural principle:
--   • Bill lines stay 100% free-text. NO item_id FK on purchase_invoice_items.
--   • Items master is touched only for *what we genuinely track in stock*.
--   • Inventory linkage lives in `inventory_grn_lines` only.
--   • `vendor_catalog_items` is the vendor-scoped reuse aid (PO + bill).
--
-- Match fields on purchase_invoices (matched_po_id, override audit) are
-- deferred to PP Phase 3 — the existing matchStatus enum
-- (unmatched|matched|mismatch) covers what Pattern-B needs in the meantime.
--
-- This migration is additive. Existing bill flow keeps working.

BEGIN;

-- 1. purchase_invoices — bill-level inventory metadata ----------------------
--
-- warehouse_id          default warehouse for the items-received sub-form
-- goods_received        toggle on the bill UI; default false
-- linked_inventory_grn_id   set on post when an inventory_grns row is auto-created
--
-- Note: the column is named `linked_inventory_grn_id` (not just `linked_grn_id`)
-- because purchase_invoices already has a legacy `grn_id` FK to the AP-side
-- `goods_receipt_notes` table. We are *not* touching that legacy linkage.

ALTER TABLE purchase_invoices
  ADD COLUMN IF NOT EXISTS warehouse_id             uuid REFERENCES warehouses(id),
  ADD COLUMN IF NOT EXISTS goods_received           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS linked_inventory_grn_id  uuid;

-- FK added after column exists so re-runs don't blow up.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pi_linked_inventory_grn_fk'
  ) THEN
    ALTER TABLE purchase_invoices
      ADD CONSTRAINT pi_linked_inventory_grn_fk
      FOREIGN KEY (linked_inventory_grn_id) REFERENCES inventory_grns(id);
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_pi_linked_inventory_grn
  ON purchase_invoices (linked_inventory_grn_id)
  WHERE linked_inventory_grn_id IS NOT NULL;

-- 2. inventory_grns — source discriminator + bill FK + idempotency ----------
--
-- Existing rows: classify by whichever linkage column is populated.
--   • bill_id IS NOT NULL → 'bill'
--   • po_id   IS NOT NULL → 'po'
--   • neither             → 'direct'

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inventory_grn_source') THEN
    CREATE TYPE inventory_grn_source AS ENUM ('po', 'bill', 'direct');
  END IF;
END$$;

ALTER TABLE inventory_grns
  ADD COLUMN IF NOT EXISTS source inventory_grn_source;

-- Backfill existing rows. Idempotent.
UPDATE inventory_grns
   SET source = CASE
     WHEN bill_id IS NOT NULL THEN 'bill'::inventory_grn_source
     WHEN po_id   IS NOT NULL THEN 'po'::inventory_grn_source
     ELSE 'direct'::inventory_grn_source
   END
 WHERE source IS NULL;

ALTER TABLE inventory_grns
  ALTER COLUMN source SET NOT NULL,
  ALTER COLUMN source SET DEFAULT 'direct';

-- bill_id was previously a bare uuid column. Add the FK now (nullable).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inv_grn_bill_fk'
  ) THEN
    ALTER TABLE inventory_grns
      ADD CONSTRAINT inv_grn_bill_fk
      FOREIGN KEY (bill_id) REFERENCES purchase_invoices(id);
  END IF;
END$$;

-- Discriminator + linkage consistency. po_id / bill_id must agree with source.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_inv_grn_source_linkage'
  ) THEN
    ALTER TABLE inventory_grns
      ADD CONSTRAINT chk_inv_grn_source_linkage CHECK (
        (source = 'po'     AND po_id   IS NOT NULL AND bill_id IS NULL) OR
        (source = 'bill'   AND bill_id IS NOT NULL AND po_id   IS NULL) OR
        (source = 'direct' AND po_id   IS NULL     AND bill_id IS NULL)
      ) NOT VALID;   -- NOT VALID so legacy rows with both/neither don't block
  END IF;
END$$;

-- Validate the constraint only after we're confident existing data is clean.
-- This is intentionally separate so an ops-time fix can run first if needed.
-- Run manually once validated: ALTER TABLE inventory_grns VALIDATE CONSTRAINT chk_inv_grn_source_linkage;

-- DB-level idempotency: at most one GRN per bill.
CREATE UNIQUE INDEX IF NOT EXISTS uq_inv_grn_source_bill
  ON inventory_grns (bill_id)
  WHERE source = 'bill';

-- 3. vendor_catalog_items — new reuse table ---------------------------------
--
-- One row per (vendor, normalised description). Optional inventory_item_id
-- bridges to items master for tracked items only. Populated explicitly
-- by user action (suggest-only, never silent — see spec §4.1).

CREATE TABLE IF NOT EXISTS vendor_catalog_items (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id),
  vendor_id              uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,

  description            varchar(255) NOT NULL,
  normalized_description varchar(255) NOT NULL,
  default_uom            varchar(20),
  default_rate           numeric(15, 2),
  hsn_sac_code           varchar(10),
  default_tax_rate       numeric(5, 2),
  default_tax_category   varchar(20),

  inventory_item_id      uuid REFERENCES items(id),

  use_count              integer NOT NULL DEFAULT 0,
  last_used_at           timestamptz,
  is_active              boolean NOT NULL DEFAULT true,

  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- Active-row uniqueness: same (vendor, normalised description) can't be active twice.
-- Inactive rows are exempt so a deactivated entry can be re-added later.
CREATE UNIQUE INDEX IF NOT EXISTS uq_vci_vendor_norm_active
  ON vendor_catalog_items (vendor_id, normalized_description)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_vci_tenant_vendor
  ON vendor_catalog_items (tenant_id, vendor_id);

CREATE INDEX IF NOT EXISTS idx_vci_inventory_item
  ON vendor_catalog_items (inventory_item_id)
  WHERE inventory_item_id IS NOT NULL;

-- 4. vendor_catalog_item_price_history --------------------------------------
--
-- One row per rate change. Written on every silent ≤5% drift update and on
-- explicit user-confirmed >5% updates. Lightweight, no FK from price_history
-- to source docs beyond a discriminator + uuid (no cross-table FK to avoid
-- coupling with bills/POs).

CREATE TABLE IF NOT EXISTS vendor_catalog_item_price_history (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  catalog_item_id uuid NOT NULL REFERENCES vendor_catalog_items(id) ON DELETE CASCADE,
  rate            numeric(15, 2) NOT NULL,
  source_doc_type varchar(20) NOT NULL,   -- 'po' | 'bill' | 'manual'
  source_doc_id   uuid,
  changed_by      uuid REFERENCES users(id),
  changed_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vci_history_catalog_item
  ON vendor_catalog_item_price_history (catalog_item_id, changed_at DESC);

COMMIT;

-- Post-migration notes:
--   1. Apply against local dev with `pnpm run-sql packages/db/migrations/0114_ap_pattern_b_schema.sql`.
--   2. Validate the GRN CHECK constraint after confirming no legacy rows
--      violate the source/linkage rules:
--        SELECT id, source, po_id, bill_id FROM inventory_grns
--         WHERE NOT (
--           (source = 'po'     AND po_id IS NOT NULL AND bill_id IS NULL) OR
--           (source = 'bill'   AND bill_id IS NOT NULL AND po_id IS NULL) OR
--           (source = 'direct' AND po_id IS NULL AND bill_id IS NULL)
--         );
--      Then: ALTER TABLE inventory_grns VALIDATE CONSTRAINT chk_inv_grn_source_linkage;
--   3. COA seed (1201–1207 per tenant) is a separate migration (0115).
--   4. vendor_bill_item_aliases backfill into vendor_catalog_items is also
--      a separate migration (0116), shipped last after the API is using the
--      new table.
