-- 0123_mfg_phase_1.sql
--
-- Manufacturing Phase 1: BOM + Work Order planning surface.
-- Spec: docs/manufacturing-plan.md §4, tracker docs/manufacturing-tracker.md.
--
-- New tables under `manufacturing` module:
--   boms          — recipe header; one active version per (tenant, output_item)
--   bom_lines     — recipe inputs with qty_per_output + scrap %
--   work_orders   — scheduled production run snapshotting (bom_id, bom_version)
--
-- Deliberately NOT in scope this phase (Phase 2):
--   * wo_consumption / wo_output tables (the run + costing path)
--   * Inventory stock_ledger writes / GL postings
--   * postManufactureJE GL routing
--
-- Item-class → COA mapping already exists in
-- apps/api/src/modules/gl/inventory-accounts.ts (INVENTORY_ACCOUNT_BY_CLASS)
-- and is reused as-is in Phase 2.

BEGIN;

-- ─── enums ──────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'wo_status') THEN
    CREATE TYPE wo_status AS ENUM (
      'draft', 'in_progress', 'completed', 'closed', 'cancelled'
    );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'qc_status') THEN
    CREATE TYPE qc_status AS ENUM (
      'pending', 'passed', 'failed', 'conditional'
    );
  END IF;
END$$;

-- ─── boms ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS boms (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id),
  bom_code            varchar(50) NOT NULL,
  name                varchar(200) NOT NULL,

  output_item_id      uuid NOT NULL REFERENCES items(id),
  output_qty          numeric(12, 3) NOT NULL,
  output_uom          varchar(20) NOT NULL,

  version             integer NOT NULL DEFAULT 1,
  is_active           boolean NOT NULL DEFAULT true,
  effective_from      date,
  notes               text,

  created_by          uuid REFERENCES users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_bom_tenant_code_version UNIQUE (tenant_id, bom_code, version),
  CONSTRAINT chk_bom_output_qty_positive CHECK (output_qty > 0),
  CONSTRAINT chk_bom_version_positive CHECK (version > 0)
);

CREATE INDEX IF NOT EXISTS idx_bom_tenant_output      ON boms (tenant_id, output_item_id);
CREATE INDEX IF NOT EXISTS idx_bom_tenant_code        ON boms (tenant_id, bom_code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_bom_active_per_item
  ON boms (tenant_id, output_item_id) WHERE is_active = true;

-- ─── bom_lines ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bom_lines (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id),
  bom_id              uuid NOT NULL REFERENCES boms(id) ON DELETE CASCADE,
  line_no             integer NOT NULL,

  input_item_id       uuid NOT NULL REFERENCES items(id),
  qty_per_output      numeric(12, 4) NOT NULL,
  input_uom           varchar(20) NOT NULL,
  scrap_pct           numeric(5, 2) NOT NULL DEFAULT 0,

  is_optional         boolean NOT NULL DEFAULT false,
  notes               text,

  CONSTRAINT chk_bom_line_qty_positive CHECK (qty_per_output > 0),
  CONSTRAINT chk_bom_line_scrap_range CHECK (scrap_pct >= 0 AND scrap_pct < 100)
);

CREATE INDEX IF NOT EXISTS idx_bom_lines_bom    ON bom_lines (bom_id);
CREATE INDEX IF NOT EXISTS idx_bom_lines_input  ON bom_lines (input_item_id);

-- ─── work_orders ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS work_orders (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id),
  wo_number           varchar(50) NOT NULL,

  bom_id              uuid NOT NULL REFERENCES boms(id),
  bom_version         integer NOT NULL,

  planned_qty         numeric(12, 3) NOT NULL,
  warehouse_id        uuid NOT NULL REFERENCES warehouses(id),
  shift               varchar(20),
  scheduled_for       date NOT NULL,

  status              wo_status NOT NULL DEFAULT 'draft',

  started_at          timestamptz,
  completed_at        timestamptz,
  closed_at           timestamptz,
  cancelled_at        timestamptz,
  cancelled_reason    text,

  -- Denormalised totals (Phase 2 populates these from wo_consumption / wo_output).
  -- Kept on the row from day one so Phase 2 doesn't need a schema migration.
  output_qty          numeric(12, 3) NOT NULL DEFAULT 0,
  consumed_value      numeric(15, 2) NOT NULL DEFAULT 0,
  output_value        numeric(15, 2) NOT NULL DEFAULT 0,
  yield_variance      numeric(15, 2) NOT NULL DEFAULT 0,

  qc_status           qc_status DEFAULT 'pending',
  je_id               uuid,

  created_by          uuid REFERENCES users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_wo_tenant_number UNIQUE (tenant_id, wo_number),
  CONSTRAINT chk_wo_planned_qty_positive CHECK (planned_qty > 0)
);

CREATE INDEX IF NOT EXISTS idx_wo_tenant_status     ON work_orders (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_wo_tenant_bom        ON work_orders (tenant_id, bom_id);
CREATE INDEX IF NOT EXISTS idx_wo_tenant_scheduled  ON work_orders (tenant_id, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_wo_tenant_warehouse  ON work_orders (tenant_id, warehouse_id);

COMMIT;
