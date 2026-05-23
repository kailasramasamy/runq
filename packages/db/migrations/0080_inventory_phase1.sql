-- 0080_inventory_phase1.sql
-- Inventory module phase 1: warehouses, stock ledger + on-hand cache,
-- inventory GRN, delivery notes; extends items master with tracking flags.
-- See docs/inventory-plan.md §3.

DO $$ BEGIN
  CREATE TYPE warehouse_type AS ENUM ('main', 'godown', 'shop', 'vehicle', 'virtual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE stock_movement_type AS ENUM (
    'grn', 'delivery', 'transfer_in', 'transfer_out',
    'adjustment_in', 'adjustment_out', 'opening', 'reversal',
    'stock_take_in', 'stock_take_out'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE inventory_grn_status AS ENUM ('draft', 'posted', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE delivery_note_status AS ENUM ('draft', 'dispatched', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── warehouses ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  code VARCHAR(30) NOT NULL,
  name VARCHAR(120) NOT NULL,
  type warehouse_type NOT NULL DEFAULT 'godown',
  address TEXT,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_wh_tenant_code ON warehouses(tenant_id, code);
CREATE INDEX IF NOT EXISTS idx_wh_tenant_active ON warehouses(tenant_id, is_active);

-- ─── items extension ───────────────────────────────────────────────────
ALTER TABLE items
  ADD COLUMN IF NOT EXISTS track_inventory BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS track_batches BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS track_serials BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS track_expiry BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS allow_negative_stock BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reorder_level NUMERIC(18, 3),
  ADD COLUMN IF NOT EXISTS reorder_qty NUMERIC(18, 3),
  ADD COLUMN IF NOT EXISTS default_warehouse_id UUID,
  ADD COLUMN IF NOT EXISTS barcode VARCHAR(64),
  ADD COLUMN IF NOT EXISTS weight_kg NUMERIC(10, 3),
  ADD COLUMN IF NOT EXISTS shelf_life_days NUMERIC(6, 0);

-- Service items should not be inventoried by default
UPDATE items SET track_inventory = FALSE WHERE type = 'service';

CREATE UNIQUE INDEX IF NOT EXISTS uq_items_tenant_barcode
  ON items(tenant_id, barcode) WHERE barcode IS NOT NULL;

-- ─── stock_ledger (append-only) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  item_id UUID NOT NULL REFERENCES items(id),
  warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  batch_no VARCHAR(60),
  movement_type stock_movement_type NOT NULL,
  source_type VARCHAR(40) NOT NULL,
  source_id UUID NOT NULL,
  source_line_id UUID,
  qty_in NUMERIC(18, 3) NOT NULL DEFAULT 0,
  qty_out NUMERIC(18, 3) NOT NULL DEFAULT 0,
  unit_cost NUMERIC(18, 4) NOT NULL DEFAULT 0,
  running_qty NUMERIC(18, 3) NOT NULL,
  running_value NUMERIC(18, 4) NOT NULL,
  moved_at TIMESTAMPTZ NOT NULL,
  posted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  posted_by UUID,
  journal_entry_id UUID REFERENCES journal_entries(id)
);
CREATE INDEX IF NOT EXISTS idx_ledger_tenant_item_wh_time
  ON stock_ledger(tenant_id, item_id, warehouse_id, moved_at);
CREATE INDEX IF NOT EXISTS idx_ledger_tenant_source
  ON stock_ledger(tenant_id, source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_ledger_tenant_moved
  ON stock_ledger(tenant_id, moved_at);

-- ─── stock_on_hand (materialised cache) ────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_on_hand (
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  item_id UUID NOT NULL REFERENCES items(id),
  warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  batch_no VARCHAR(60) NOT NULL DEFAULT '',
  qty NUMERIC(18, 3) NOT NULL DEFAULT 0,
  avg_cost NUMERIC(18, 4) NOT NULL DEFAULT 0,
  value NUMERIC(18, 4) NOT NULL DEFAULT 0,
  last_movement_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS pk_stock_on_hand
  ON stock_on_hand(tenant_id, item_id, warehouse_id, batch_no);
CREATE INDEX IF NOT EXISTS idx_soh_tenant_item ON stock_on_hand(tenant_id, item_id);
CREATE INDEX IF NOT EXISTS idx_soh_tenant_wh ON stock_on_hand(tenant_id, warehouse_id);

-- ─── inventory_grns + lines ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_grns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  grn_no VARCHAR(40) NOT NULL,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  vendor_id UUID REFERENCES vendors(id),
  bill_id UUID,
  po_id UUID,
  received_date DATE NOT NULL,
  vehicle_no VARCHAR(30),
  lr_no VARCHAR(40),
  notes TEXT,
  status inventory_grn_status NOT NULL DEFAULT 'draft',
  total_value NUMERIC(18, 2) NOT NULL DEFAULT 0,
  journal_entry_id UUID,
  cancelled_journal_entry_id UUID,
  posted_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_inv_grn_tenant_no ON inventory_grns(tenant_id, grn_no);
CREATE INDEX IF NOT EXISTS idx_inv_grn_tenant_status ON inventory_grns(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_inv_grn_tenant_wh ON inventory_grns(tenant_id, warehouse_id);

CREATE TABLE IF NOT EXISTS inventory_grn_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  grn_id UUID NOT NULL REFERENCES inventory_grns(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES items(id),
  batch_no VARCHAR(60),
  mfg_date DATE,
  expiry_date DATE,
  qty NUMERIC(18, 3) NOT NULL,
  uom VARCHAR(20),
  unit_rate NUMERIC(18, 4) NOT NULL,
  landed_cost_per_unit NUMERIC(18, 4) NOT NULL DEFAULT 0,
  line_total NUMERIC(18, 2) NOT NULL,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_inv_grn_lines_grn ON inventory_grn_lines(grn_id);
CREATE INDEX IF NOT EXISTS idx_inv_grn_lines_item ON inventory_grn_lines(tenant_id, item_id);

-- ─── delivery_notes + lines ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS delivery_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  dn_no VARCHAR(40) NOT NULL,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  customer_id UUID REFERENCES customers(id),
  invoice_id UUID,
  so_id UUID,
  dispatch_date DATE NOT NULL,
  vehicle_no VARCHAR(30),
  lr_no VARCHAR(40),
  e_way_bill_no VARCHAR(30),
  notes TEXT,
  status delivery_note_status NOT NULL DEFAULT 'draft',
  total_value NUMERIC(18, 2) NOT NULL DEFAULT 0,
  journal_entry_id UUID,
  cancelled_journal_entry_id UUID,
  dispatched_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_dn_tenant_no ON delivery_notes(tenant_id, dn_no);
CREATE INDEX IF NOT EXISTS idx_dn_tenant_status ON delivery_notes(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_dn_tenant_wh ON delivery_notes(tenant_id, warehouse_id);

CREATE TABLE IF NOT EXISTS delivery_note_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  dn_id UUID NOT NULL REFERENCES delivery_notes(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES items(id),
  batch_no VARCHAR(60),
  qty NUMERIC(18, 3) NOT NULL,
  uom VARCHAR(20),
  unit_cost NUMERIC(18, 4) NOT NULL DEFAULT 0,
  line_total NUMERIC(18, 2) NOT NULL DEFAULT 0,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_dn_lines_dn ON delivery_note_lines(dn_id);
CREATE INDEX IF NOT EXISTS idx_dn_lines_item ON delivery_note_lines(tenant_id, item_id);
