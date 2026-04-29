-- Bank reconciliation match corrections: log every manual match / unmatch
-- so smart-match can later score suggestions based on a tenant's actual
-- correction history. Closes the recon feedback loop the audit flagged.
--
-- Storing the narration pattern (not full text) so similar future
-- transactions group together. Vendor/customer is denormalized from the
-- matched payment/receipt at log time.

DO $$ BEGIN
  CREATE TYPE bank_match_action AS ENUM ('match', 'unmatch');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS bank_match_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  bank_transaction_id UUID NOT NULL REFERENCES bank_transactions(id),
  narration_pattern TEXT,
  amount NUMERIC(15,2) NOT NULL,
  txn_type VARCHAR(10) NOT NULL,
  payment_id UUID,
  receipt_id UUID,
  vendor_id UUID,
  customer_id UUID,
  action bank_match_action NOT NULL,
  acted_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bmc_pattern_vendor ON bank_match_corrections (tenant_id, narration_pattern, vendor_id) WHERE narration_pattern IS NOT NULL AND vendor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bmc_pattern_customer ON bank_match_corrections (tenant_id, narration_pattern, customer_id) WHERE narration_pattern IS NOT NULL AND customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bmc_tenant_txn ON bank_match_corrections (tenant_id, bank_transaction_id);
