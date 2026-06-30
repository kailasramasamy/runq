-- Pending payments: out-of-band payments (bank QR/UPI scans) captured in the
-- app at pay time, auto-matched to the imported bank debit later so the
-- "what was this for" context isn't lost at reconciliation.
CREATE TYPE pending_payment_status AS ENUM ('pending', 'matched', 'cancelled');

CREATE TABLE IF NOT EXISTS pending_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  bank_account_id uuid NOT NULL REFERENCES bank_accounts(id),
  amount numeric(15,2) NOT NULL,
  payment_date date NOT NULL,
  gl_account_id uuid NOT NULL REFERENCES accounts(id),
  payee_name varchar(255),
  note varchar(500),
  upi_ref varchar(64),
  status pending_payment_status NOT NULL DEFAULT 'pending',
  matched_bank_transaction_id uuid REFERENCES bank_transactions(id),
  matched_at timestamptz,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pending_pay_tenant_status ON pending_payments (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_pending_pay_account_amount ON pending_payments (bank_account_id, amount);

-- Let the captured confirmation photo move onto the reconciled bank txn (and
-- makes the existing bank-transaction document trail usable).
ALTER TYPE attachment_entity_type ADD VALUE IF NOT EXISTS 'bank_transaction';
