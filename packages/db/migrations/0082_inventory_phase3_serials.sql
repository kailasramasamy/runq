-- 0082_inventory_phase3_serials.sql
-- Phase 3: per-unit serial tracking. Reports in Phase 3 are read-only over
-- existing tables so they need no schema work.

DO $$ BEGIN
  CREATE TYPE inv_serial_status AS ENUM (
    'in_stock', 'sold', 'returned', 'scrapped', 'in_transit'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS inventory_serials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  item_id UUID NOT NULL REFERENCES items(id),
  serial_no VARCHAR(80) NOT NULL,
  current_warehouse_id UUID REFERENCES warehouses(id),
  current_status inv_serial_status NOT NULL DEFAULT 'in_stock',
  batch_no VARCHAR(60),
  grn_id UUID,
  dn_id UUID,
  notes VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_inv_serial_tenant_item_no
  ON inventory_serials(tenant_id, item_id, serial_no);
CREATE INDEX IF NOT EXISTS idx_inv_serial_tenant_status
  ON inventory_serials(tenant_id, current_status);
CREATE INDEX IF NOT EXISTS idx_inv_serial_tenant_wh
  ON inventory_serials(tenant_id, current_warehouse_id);
