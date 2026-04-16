CREATE TABLE IF NOT EXISTS asset_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  asset_id UUID NOT NULL REFERENCES fixed_assets(id),
  from_location VARCHAR(255) NOT NULL,
  to_location VARCHAR(255) NOT NULL,
  transfer_date DATE NOT NULL,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_at_tenant_asset ON asset_transfers (tenant_id, asset_id);
