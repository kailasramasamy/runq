-- 0081_inventory_phase2.sql
-- Phase 2: transfers, adjustments, stock takes, reorder rules.

DO $$ BEGIN
  CREATE TYPE inv_transfer_status AS ENUM ('draft', 'in_transit', 'received', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE inv_adjustment_reason AS ENUM (
    'damage', 'expiry', 'theft', 'found', 'revaluation', 'correction', 'opening_balance'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE inv_adjustment_status AS ENUM ('draft', 'pending_approval', 'posted', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE inv_stock_take_scope AS ENUM ('full', 'partial', 'cycle');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE inv_stock_take_status AS ENUM ('in_progress', 'reviewed', 'posted', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── transfers ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  transfer_no VARCHAR(40) NOT NULL,
  from_warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  to_warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  status inv_transfer_status NOT NULL DEFAULT 'draft',
  vehicle_no VARCHAR(30),
  notes TEXT,
  total_value NUMERIC(18, 2) NOT NULL DEFAULT 0,
  dispatched_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_inv_transfer_tenant_no
  ON inventory_transfers(tenant_id, transfer_no);
CREATE INDEX IF NOT EXISTS idx_inv_transfer_tenant_status
  ON inventory_transfers(tenant_id, status);

CREATE TABLE IF NOT EXISTS inventory_transfer_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  transfer_id UUID NOT NULL REFERENCES inventory_transfers(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES items(id),
  batch_no VARCHAR(60),
  qty NUMERIC(18, 3) NOT NULL,
  qty_received NUMERIC(18, 3) NOT NULL DEFAULT 0,
  unit_cost NUMERIC(18, 4) NOT NULL DEFAULT 0,
  line_total NUMERIC(18, 2) NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_inv_transfer_lines_transfer
  ON inventory_transfer_lines(transfer_id);
CREATE INDEX IF NOT EXISTS idx_inv_transfer_lines_item
  ON inventory_transfer_lines(tenant_id, item_id);

-- ─── adjustments ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  adj_no VARCHAR(40) NOT NULL,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  reason inv_adjustment_reason NOT NULL,
  adjustment_date DATE NOT NULL,
  notes TEXT,
  status inv_adjustment_status NOT NULL DEFAULT 'draft',
  requires_approval BOOLEAN NOT NULL DEFAULT FALSE,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  total_value_delta NUMERIC(18, 2) NOT NULL DEFAULT 0,
  journal_entry_id UUID,
  posted_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_inv_adj_tenant_no
  ON inventory_adjustments(tenant_id, adj_no);
CREATE INDEX IF NOT EXISTS idx_inv_adj_tenant_status
  ON inventory_adjustments(tenant_id, status);

CREATE TABLE IF NOT EXISTS inventory_adjustment_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  adjustment_id UUID NOT NULL REFERENCES inventory_adjustments(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES items(id),
  batch_no VARCHAR(60),
  qty_delta NUMERIC(18, 3) NOT NULL,
  unit_cost NUMERIC(18, 4) NOT NULL DEFAULT 0,
  value_delta NUMERIC(18, 2) NOT NULL DEFAULT 0,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_inv_adj_lines_adj
  ON inventory_adjustment_lines(adjustment_id);
CREATE INDEX IF NOT EXISTS idx_inv_adj_lines_item
  ON inventory_adjustment_lines(tenant_id, item_id);

-- ─── stock takes ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_stock_takes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  st_no VARCHAR(40) NOT NULL,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  scope inv_stock_take_scope NOT NULL DEFAULT 'full',
  category_id UUID REFERENCES categories(id),
  notes TEXT,
  status inv_stock_take_status NOT NULL DEFAULT 'in_progress',
  frozen BOOLEAN NOT NULL DEFAULT FALSE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  adjustment_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_inv_st_tenant_no
  ON inventory_stock_takes(tenant_id, st_no);
CREATE INDEX IF NOT EXISTS idx_inv_st_tenant_status
  ON inventory_stock_takes(tenant_id, status);

CREATE TABLE IF NOT EXISTS inventory_stock_take_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  stock_take_id UUID NOT NULL REFERENCES inventory_stock_takes(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES items(id),
  batch_no VARCHAR(60),
  system_qty NUMERIC(18, 3) NOT NULL,
  counted_qty NUMERIC(18, 3),
  unit_cost NUMERIC(18, 4) NOT NULL DEFAULT 0,
  recount_flag BOOLEAN NOT NULL DEFAULT FALSE,
  counted_by UUID,
  counted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_inv_st_lines_st
  ON inventory_stock_take_lines(stock_take_id);
CREATE INDEX IF NOT EXISTS idx_inv_st_lines_item
  ON inventory_stock_take_lines(tenant_id, item_id);
-- Coalesce nullable batch_no to '' so the unique index treats the no-batch
-- case as a single addressable row per (st, item).
CREATE UNIQUE INDEX IF NOT EXISTS uq_inv_st_lines_per_batch
  ON inventory_stock_take_lines(stock_take_id, item_id, COALESCE(batch_no, ''));

-- ─── reorder rules ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_reorder_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  item_id UUID NOT NULL REFERENCES items(id),
  warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  reorder_level NUMERIC(18, 3) NOT NULL,
  reorder_qty NUMERIC(18, 3) NOT NULL,
  lead_time_days INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_reorder_rule_per_item_wh
  ON inventory_reorder_rules(tenant_id, item_id, warehouse_id);
CREATE INDEX IF NOT EXISTS idx_reorder_rule_tenant
  ON inventory_reorder_rules(tenant_id);
