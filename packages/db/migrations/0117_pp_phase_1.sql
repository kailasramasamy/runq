-- 0117_pp_phase_1.sql
--
-- Purchase & Procurement Phase 1: PO core. Spec: docs/purchase-procurement-plan.md §4.
--
-- New tables under `purchase` module:
--   purchase_orders        — commitment doc; no JE on create (PO is not a financial event)
--   purchase_order_lines   — free-text vendor-facing lines per the AP Pattern-B principle
--                            (no FK to items master; optional FK to vendor_catalog_items
--                            for reuse / future inventory linkage).
--
-- Deliberately NOT in scope this phase:
--   * GRN-from-PO linkage (Phase 2; inventory_grns.po_id already exists from migration 0114)
--   * 3-way match fields on purchase_invoices (Phase 3)
--   * purchase_requisitions / pr_approvals (Phase 5, behind tenant flag)
--   * inventory_grn_lines.po_line_id (Phase 2)
--
-- The legacy `ap.purchase_orders` table is left alone — it carries WMS
-- integration fields and is treated as read-only deprecated. The new
-- `purchase.purchase_orders` is a clean slate.

BEGIN;

-- ─── enums ──────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'purchase_order_status') THEN
    CREATE TYPE purchase_order_status AS ENUM (
      'draft', 'sent', 'partially_received', 'received', 'closed', 'cancelled'
    );
  END IF;
END$$;

-- ─── purchase_orders ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS purchase_orders_v2 (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id),
  po_number           varchar(50) NOT NULL,
  vendor_id           uuid NOT NULL REFERENCES vendors(id),

  po_date             date NOT NULL,
  expected_date       date,
  delivery_address    text,
  payment_terms       varchar(100),
  notes               text,

  status              purchase_order_status NOT NULL DEFAULT 'draft',

  -- Source PR linkage — added in Phase 5 when PRs land; nullable forever.
  source_pr_id        uuid,

  subtotal            numeric(15, 2) NOT NULL DEFAULT 0,
  tax_total           numeric(15, 2) NOT NULL DEFAULT 0,
  total               numeric(15, 2) NOT NULL DEFAULT 0,

  created_by          uuid REFERENCES users(id),
  approved_by         uuid REFERENCES users(id),
  approved_at         timestamptz,
  sent_at             timestamptz,
  closed_at           timestamptz,
  closed_reason       text,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_po_v2_tenant_number UNIQUE (tenant_id, po_number)
);

CREATE INDEX IF NOT EXISTS idx_po_v2_tenant_status     ON purchase_orders_v2 (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_po_v2_tenant_vendor     ON purchase_orders_v2 (tenant_id, vendor_id);
CREATE INDEX IF NOT EXISTS idx_po_v2_tenant_po_date    ON purchase_orders_v2 (tenant_id, po_date);

-- ─── purchase_order_lines ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS purchase_order_lines_v2 (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id),
  po_id               uuid NOT NULL REFERENCES purchase_orders_v2(id) ON DELETE CASCADE,
  line_no             integer NOT NULL,

  description         varchar(255) NOT NULL,
  catalog_item_id     uuid REFERENCES vendor_catalog_items(id),
  uom                 varchar(20),
  hsn_sac_code        varchar(10),

  qty_ordered         numeric(12, 3) NOT NULL,
  unit_rate           numeric(15, 2) NOT NULL,
  amount              numeric(15, 2) NOT NULL,
  tax_rate            numeric(5, 2) DEFAULT 0,
  tax_amount          numeric(15, 2) DEFAULT 0,

  -- Denormalised counters updated by Phase 2 (GRN-from-PO) and the AP
  -- bill-match path. Start at 0; drive PO status transitions.
  qty_received        numeric(12, 3) NOT NULL DEFAULT 0,
  qty_billed          numeric(12, 3) NOT NULL DEFAULT 0,

  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pol_v2_po       ON purchase_order_lines_v2 (po_id);
CREATE INDEX IF NOT EXISTS idx_pol_v2_catalog  ON purchase_order_lines_v2 (catalog_item_id)
  WHERE catalog_item_id IS NOT NULL;

COMMIT;

-- Note on table names: `_v2` suffix avoids the collision with the legacy
-- `purchase_orders` / `purchase_order_items` tables in the `ap/` schema
-- module (which carry wms_po_id etc and stay for backward compat per
-- PP plan §2 sequencing decision). Drizzle schemas alias them back to
-- clean names via `pgTable('purchase_orders_v2', ...)` exports.
