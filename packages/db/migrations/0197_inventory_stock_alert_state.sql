-- Stock alert edge-detection state: one row per (tenant, item, warehouse).
-- Used only to detect low/out-of-stock TRANSITIONS and dedupe notifications;
-- the alert lists themselves are always computed live off stock_on_hand.

DO $$ BEGIN
  CREATE TYPE stock_alert_status AS ENUM ('ok', 'low', 'out');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS inventory_stock_alert_state (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  item_id           UUID NOT NULL REFERENCES items(id),
  warehouse_id      UUID NOT NULL REFERENCES warehouses(id),
  status            stock_alert_status NOT NULL DEFAULT 'ok',
  on_hand           NUMERIC(18,3) NOT NULL DEFAULT 0,
  threshold         NUMERIC(18,3),
  status_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notify_pending    BOOLEAN NOT NULL DEFAULT FALSE,
  notified_at       TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_alert_state_item_wh
  ON inventory_stock_alert_state (tenant_id, item_id, warehouse_id);

CREATE INDEX IF NOT EXISTS idx_stock_alert_pending
  ON inventory_stock_alert_state (tenant_id, notify_pending);
