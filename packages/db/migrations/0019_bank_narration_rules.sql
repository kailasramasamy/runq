-- Learned narration → GL account mappings per tenant.
-- When a user manually categorizes a transaction, the pattern is saved
-- so future imports auto-categorize + auto-reconcile matching transactions.

CREATE TABLE IF NOT EXISTS bank_narration_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  pattern VARCHAR(500) NOT NULL,
  gl_account_id UUID NOT NULL REFERENCES accounts(id),
  auto_reconcile BOOLEAN NOT NULL DEFAULT true,
  txn_type VARCHAR(10),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bnr_tenant ON bank_narration_rules (tenant_id);
