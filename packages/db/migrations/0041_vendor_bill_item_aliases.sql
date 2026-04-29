-- Per-vendor item aliases: when "Acme Logistics" sends a bill with line
-- "ACME WIDGETS 12mm" and the user saves it with HSN 73181500 + 18% GST,
-- remember that mapping. Next bill from Acme with the same line: we
-- pre-fill HSN and tax rate, AI doesn't have to guess.
--
-- Keyed on a normalized form of the description (lowercase, trimmed,
-- collapsed whitespace) to absorb minor formatting variance. Stored
-- alongside the original raw description for human inspection.

CREATE TABLE IF NOT EXISTS vendor_bill_item_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  raw_description TEXT NOT NULL,
  normalized_key TEXT NOT NULL,
  suggested_hsn_sac VARCHAR(10),
  suggested_tax_rate NUMERIC(5,2),
  suggested_tax_category VARCHAR(20),
  use_count INTEGER NOT NULL DEFAULT 1,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, vendor_id, normalized_key)
);

CREATE INDEX IF NOT EXISTS idx_vbia_lookup ON vendor_bill_item_aliases (tenant_id, vendor_id, normalized_key);
