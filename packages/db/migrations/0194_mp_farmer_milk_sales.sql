-- 0194_mp_farmer_milk_sales.sql
--
-- Trader-farmers: a farmer who supplies us AND buys milk back from us (excess
-- collected at the centre). The purchase is recorded as a milk SALE that
--   • debits the farmer ledger (`milk_sale`), recovered by the next payout
--     cycle as a `milk_sale` deduction — ahead of advances and feed loans;
--   • counts as an outflow of litres at the node, so collected-vs-dispatched
--     still reconciles instead of showing a phantom shortage.
--
-- Raw milk is GST-exempt, so no tax invoice is raised: the ledger line and the
-- pour statement are the documents. Revenue is booked to a dedicated income
-- account (4006) rather than credited against Milk Purchases, so procurement
-- cost stays readable.
--
-- Apply in native dev via scripts/run-sql.ts (drizzle-kit push is the prod path).

BEGIN;

-- Enum values first: they must be committed before a table can default to them,
-- but these are only ever written by INSERT, so one transaction is fine.
ALTER TYPE mp_ledger_entry ADD VALUE IF NOT EXISTS 'milk_sale' AFTER 'feed_loan_given';
ALTER TYPE mp_deduction ADD VALUE IF NOT EXISTS 'milk_sale' AFTER 'cattle_feed_loan';

CREATE TABLE IF NOT EXISTS mp_farmer_milk_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  farmer_id uuid NOT NULL REFERENCES mp_farmers(id),
  node_id uuid NOT NULL REFERENCES mp_nodes(id),
  sale_date date NOT NULL,
  shift mp_shift,
  milk_type mp_milk_type NOT NULL,
  qty_litres numeric(12,3) NOT NULL,
  rate_per_litre numeric(8,2) NOT NULL,
  amount numeric(15,2) NOT NULL,
  note varchar(255),
  ledger_entry_id uuid REFERENCES mp_farmer_ledger(id),
  journal_entry_id uuid REFERENCES journal_entries(id),
  reversed_at timestamptz,
  reversed_by uuid REFERENCES users(id),
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mp_milk_sales_node_date
  ON mp_farmer_milk_sales (tenant_id, node_id, sale_date);
CREATE INDEX IF NOT EXISTS idx_mp_milk_sales_farmer
  ON mp_farmer_milk_sales (tenant_id, farmer_id, sale_date);

ALTER TABLE mp_gl_settings
  ADD COLUMN IF NOT EXISTS milk_sale_receivable_account_id uuid REFERENCES accounts(id),
  ADD COLUMN IF NOT EXISTS milk_sale_income_account_id uuid REFERENCES accounts(id);

-- Backfill the two accounts for existing tenants (new tenants get them from
-- STANDARD_COA). Same NOT EXISTS / scalar-subquery-parent shape as 0151.
INSERT INTO accounts (tenant_id, code, name, type, parent_id)
SELECT t.id, v.code, v.name, v.type::account_type,
  (SELECT p.id FROM accounts p
   WHERE p.tenant_id = t.id AND p.code = v.parent_code
   ORDER BY p.created_at LIMIT 1)
FROM tenants t
CROSS JOIN (VALUES
  ('1152', 'Farmer Milk Sales Receivable', 'asset',   '1100'),
  ('4006', 'Milk Sales — Farmers & Traders', 'revenue', '4100')
) AS v(code, name, type, parent_code)
WHERE NOT EXISTS (
  SELECT 1 FROM accounts a WHERE a.tenant_id = t.id AND a.code = v.code
);

COMMIT;
