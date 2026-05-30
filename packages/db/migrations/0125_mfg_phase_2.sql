-- 0125_mfg_phase_2.sql
--
-- Manufacturing Phase 2 (2/2): Run + costing.
-- Spec: docs/manufacturing-plan.md §4.4–4.6, §8, §11.
--
-- Prerequisite: 0124_mfg_phase_2_enum.sql must be applied first
-- (adds production_in / production_out to stock_movement_type).
--
-- What this migration does:
--   1. Creates `wo_consumption` (per-input draw from stock).
--   2. Creates `wo_output` (FG batch emit; cost set at WO close).
--   3. Inserts `5105 Production Yield Variance` for every existing tenant
--      that doesn't already have it (system account, under 5100 COGS).
--
-- Batch model: `batch_no varchar(60)` matches the existing string-batch
-- convention used by stock_ledger, stock_on_hand, and inventory_grn_lines.
-- See plan §4.5b. A real `stock_batches` table is deferred to Epoch 2 (QC).

BEGIN;

-- ─── wo_consumption ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS wo_consumption (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id),
  wo_id               uuid NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  bom_line_id         uuid REFERENCES bom_lines(id),
  input_item_id       uuid NOT NULL REFERENCES items(id),
  batch_no            varchar(60),
  warehouse_id        uuid NOT NULL REFERENCES warehouses(id),

  qty                 numeric(12, 3) NOT NULL,
  uom                 varchar(20) NOT NULL,
  unit_cost           numeric(15, 4) NOT NULL,
  value               numeric(15, 2) NOT NULL,

  consumed_at         timestamptz NOT NULL DEFAULT now(),
  consumed_by         uuid REFERENCES users(id),
  stock_txn_id        uuid,                -- backlinks to stock_ledger.id at post time

  notes               text,

  CONSTRAINT chk_wo_cons_qty_positive CHECK (qty > 0),
  CONSTRAINT chk_wo_cons_unit_cost_nonneg CHECK (unit_cost >= 0)
);

CREATE INDEX IF NOT EXISTS idx_wo_cons_wo        ON wo_consumption (wo_id);
CREATE INDEX IF NOT EXISTS idx_wo_cons_tenant    ON wo_consumption (tenant_id);
CREATE INDEX IF NOT EXISTS idx_wo_cons_item      ON wo_consumption (input_item_id);
CREATE INDEX IF NOT EXISTS idx_wo_cons_batch     ON wo_consumption (batch_no)
  WHERE batch_no IS NOT NULL;

-- ─── wo_output ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS wo_output (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id),
  wo_id               uuid NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  output_item_id      uuid NOT NULL REFERENCES items(id),
  batch_no            varchar(60) NOT NULL,
  warehouse_id        uuid NOT NULL REFERENCES warehouses(id),

  qty                 numeric(12, 3) NOT NULL,
  uom                 varchar(20) NOT NULL,
  unit_cost           numeric(15, 4) NOT NULL DEFAULT 0,   -- set at WO close
  value               numeric(15, 2) NOT NULL DEFAULT 0,   -- set at WO close
  expiry_date         date,

  produced_at         timestamptz NOT NULL DEFAULT now(),
  produced_by         uuid REFERENCES users(id),
  stock_txn_id        uuid,                                 -- backlinks to stock_ledger.id at close time

  notes               text,

  CONSTRAINT uq_wo_output_batch UNIQUE (tenant_id, output_item_id, batch_no),
  CONSTRAINT chk_wo_output_qty_positive CHECK (qty > 0),
  CONSTRAINT chk_wo_output_unit_cost_nonneg CHECK (unit_cost >= 0)
);

CREATE INDEX IF NOT EXISTS idx_wo_output_wo      ON wo_output (wo_id);
CREATE INDEX IF NOT EXISTS idx_wo_output_tenant  ON wo_output (tenant_id);
CREATE INDEX IF NOT EXISTS idx_wo_output_item    ON wo_output (output_item_id);
CREATE INDEX IF NOT EXISTS idx_wo_output_expiry  ON wo_output (expiry_date)
  WHERE expiry_date IS NOT NULL;

-- ─── COA: backfill 5105 Production Yield Variance per tenant ────────────

-- Find the COGS parent (5100) per tenant and insert 5105 as child if missing.
-- Standard COA seed handles new tenants going forward; this is for existing ones.
-- DISTINCT ON (t.id) guards against a tenant with duplicate 5100 parents
-- (a stale-seed anomaly we hit on dev — would otherwise double-insert).
INSERT INTO accounts (
  id, tenant_id, code, name, type, parent_id, is_active, is_system_account
)
SELECT DISTINCT ON (t.id)
  gen_random_uuid(),
  t.id,
  '5105',
  'Production Yield Variance',
  'expense'::account_type,
  parent.id,
  true,
  true
FROM tenants t
JOIN accounts parent
  ON parent.tenant_id = t.id AND parent.code = '5100'
WHERE NOT EXISTS (
  SELECT 1 FROM accounts existing
  WHERE existing.tenant_id = t.id AND existing.code = '5105'
)
ORDER BY t.id, parent.id;

COMMIT;
