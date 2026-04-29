-- Buyer-name / buyer-GSTIN aliases for AR PO intake. Mirror of
-- customer_sku_aliases but keyed on the BUYER fingerprint (the way the
-- customer's PO software writes their own name / GSTIN). Lets next PO
-- from the same buyer auto-resolve the customer record without AI/fuzzy.

CREATE TABLE IF NOT EXISTS customer_buyer_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  -- Either a normalized name or a GSTIN. We store both forms as separate
  -- rows when both are present; lookup is OR across them.
  alias_kind VARCHAR(10) NOT NULL,  -- 'name' | 'gstin'
  alias_text TEXT NOT NULL,
  use_count INTEGER NOT NULL DEFAULT 1,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, alias_kind, alias_text)
);

CREATE INDEX IF NOT EXISTS idx_cba_lookup ON customer_buyer_aliases (tenant_id, alias_kind, alias_text);
