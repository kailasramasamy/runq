-- 0068_customer_payment_claims.sql
-- Customer-reported payments from the portal. The customer asserts they paid;
-- this is NOT an actual receipt — bank reconciliation remains the source of
-- truth. Once the AR person matches a real bank txn to a claim, the claim
-- gets status='verified' and matched_receipt_id is set.

DO $$ BEGIN
  CREATE TYPE customer_payment_claim_status AS ENUM ('pending', 'verified', 'rejected', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS customer_payment_claims (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id),
  customer_id         UUID NOT NULL REFERENCES customers(id),
  claimed_amount      NUMERIC(15, 2) NOT NULL,
  claim_date          DATE NOT NULL,
  payment_method      VARCHAR(40) NOT NULL,
  reference_number    VARCHAR(100),
  notes               TEXT,
  status              customer_payment_claim_status NOT NULL DEFAULT 'pending',
  matched_receipt_id  UUID REFERENCES payment_receipts(id),
  verified_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_claims_tenant_customer
  ON customer_payment_claims (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_payment_claims_status
  ON customer_payment_claims (status) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS customer_payment_claim_invoices (
  claim_id    UUID NOT NULL REFERENCES customer_payment_claims(id) ON DELETE CASCADE,
  invoice_id  UUID NOT NULL REFERENCES sales_invoices(id),
  amount      NUMERIC(15, 2) NOT NULL,
  PRIMARY KEY (claim_id, invoice_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_claim_invoices_invoice
  ON customer_payment_claim_invoices (invoice_id);
