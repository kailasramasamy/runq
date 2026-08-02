-- Manufacturing — unplanned production entry ("Record Production", no WO).
--
-- Shop-floor technicians make product without a planned work order when the
-- plant manager is away. The entry still posts through the WO engine so the
-- ledger, costing and GL paths stay single-sourced — it is just flagged as
-- unplanned so managers can review what happened while they were out.
--
-- 1. wo_entry_mode enum + work_orders.entry_mode
-- 2. work_orders.idempotency_key — top-level dedupe for the mobile offline
--    queue (the child consumption/output rows already carry their own keys,
--    but a backflush posts as one atomic unit and needs one key).
-- 3. 'technician' user role — shop-floor login with manufacturing run rights
--    only (no BOM/WO authoring, no finance).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'wo_entry_mode') THEN
    CREATE TYPE wo_entry_mode AS ENUM ('planned', 'unplanned');
  END IF;
END
$$;

ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS entry_mode wo_entry_mode NOT NULL DEFAULT 'planned';

ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_wo_tenant_entry_mode
  ON work_orders (tenant_id, entry_mode);

CREATE UNIQUE INDEX IF NOT EXISTS uq_wo_tenant_idempotency
  ON work_orders (tenant_id, idempotency_key);

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'technician';
