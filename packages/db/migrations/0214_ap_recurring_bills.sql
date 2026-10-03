-- Recurring monthly bills (rent, transport). An agreement raises one approved
-- purchase invoice per month; the invoice carries the agreement + period so a
-- month can never be billed twice. A semi_monthly agreement bills on the 1st
-- and the 16th; the period is that bill date.
BEGIN;
DO $$ BEGIN
  CREATE TYPE recurring_bill_category AS ENUM ('rent', 'transport', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE recurring_bill_frequency AS ENUM ('monthly', 'semi_monthly');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS recurring_bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  vendor_id uuid NOT NULL REFERENCES vendors(id),
  title varchar(120) NOT NULL,
  category recurring_bill_category NOT NULL,
  expense_account_code varchar(20) NOT NULL,
  amount numeric(15, 2) NOT NULL,
  frequency recurring_bill_frequency NOT NULL DEFAULT 'monthly',
  bill_day integer NOT NULL DEFAULT 1,
  start_month date NOT NULL,
  end_month date,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_recurring_bills_tenant ON recurring_bills (tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_recurring_bills_vendor ON recurring_bills (tenant_id, vendor_id);

ALTER TABLE purchase_invoices
  ADD COLUMN IF NOT EXISTS recurring_bill_id uuid REFERENCES recurring_bills(id),
  ADD COLUMN IF NOT EXISTS recurring_period date;
CREATE UNIQUE INDEX IF NOT EXISTS uq_pi_recurring_period
  ON purchase_invoices (recurring_bill_id, recurring_period);
COMMIT;
