-- 0159_mp_vmcc_bills.sql
--
-- Per-VMCC settlement billing for milk-procurement (Dhenu). When a VMCC pays its
-- farmers on the company's behalf (payout_mode = via_vmcc), the company owes it
-- the milk cost fronted (net payable) + the VMCC operator's full comp
-- (commission + salary + rent). This adds the bill as the settlement unit:
--   • generate → one bill per (locked cycle, via_vmcc VMCC)
--   • pay      → Dr Farmer Payable / Cr Bank (milk) + Dr Commission 5060 / Cr Bank
--                (commission), AP payment to the VMCC vendor, txn confirmation
--
-- Also seeds the commission expense leaf 5060 for existing tenants (new tenants
-- get it via STANDARD_COA), and adds the config override + payout-line back-ref.
--
-- Apply in native dev via scripts/run-sql.ts (drizzle-kit push is the prod path).

BEGIN;

-- Bill status enum (mirrors mp_cycle_status).
DO $$ BEGIN
  CREATE TYPE mp_bill_status AS ENUM ('generated', 'paid', 'reversed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS mp_vmcc_bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  bill_no varchar(40) NOT NULL,
  payout_cycle_id uuid NOT NULL REFERENCES mp_payout_cycles(id),
  vmcc_node_id uuid NOT NULL REFERENCES mp_nodes(id),
  cc_node_id uuid NOT NULL REFERENCES mp_nodes(id),
  payee_vendor_id uuid REFERENCES vendors(id),
  milk_cost decimal(15,2) NOT NULL DEFAULT '0',
  commission decimal(15,2) NOT NULL DEFAULT '0',
  salary decimal(15,2) NOT NULL DEFAULT '0',
  rent decimal(15,2) NOT NULL DEFAULT '0',
  total_amount decimal(15,2) NOT NULL DEFAULT '0',
  qty_litres decimal(12,3) NOT NULL DEFAULT '0',
  farmer_count integer NOT NULL DEFAULT 0,
  status mp_bill_status NOT NULL DEFAULT 'generated',
  payment_id uuid REFERENCES payments(id),
  milk_journal_entry_id uuid REFERENCES journal_entries(id),
  commission_journal_entry_id uuid REFERENCES journal_entries(id),
  txn_reference varchar(120),
  payment_mode varchar(30),
  payment_date date,
  paid_by uuid REFERENCES users(id),
  generated_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  reversed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_mp_vmcc_bill_no
  ON mp_vmcc_bills (tenant_id, bill_no);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mp_vmcc_bill_cycle_node
  ON mp_vmcc_bills (tenant_id, payout_cycle_id, vmcc_node_id);
CREATE INDEX IF NOT EXISTS idx_mp_vmcc_bill_cc
  ON mp_vmcc_bills (tenant_id, cc_node_id, payout_cycle_id);
CREATE INDEX IF NOT EXISTS idx_mp_vmcc_bill_status
  ON mp_vmcc_bills (tenant_id, status);

-- Payout line back-reference to its settling bill (FK enforced here, not in the
-- Drizzle schema, to avoid a circular import between payouts.ts and billing.ts).
ALTER TABLE mp_payout_lines
  ADD COLUMN IF NOT EXISTS bill_id uuid REFERENCES mp_vmcc_bills(id);

-- Commission expense account override for the GL poster.
ALTER TABLE mp_gl_settings
  ADD COLUMN IF NOT EXISTS commission_expense_account_id uuid REFERENCES accounts(id);

-- Backfill the commission expense leaf 5060 for every existing tenant.
-- NOT EXISTS rather than ON CONFLICT (dev DBs may lack the (tenant_id, code)
-- unique constraint); parent resolved via a scalar subquery (LIMIT 1) to avoid
-- fan-out on tenants with duplicate parent codes. Mirrors 0151.
INSERT INTO accounts (tenant_id, code, name, type, parent_id)
SELECT t.id, v.code, v.name, v.type::account_type,
  (SELECT p.id FROM accounts p
   WHERE p.tenant_id = t.id AND p.code = v.parent_code
   ORDER BY p.created_at LIMIT 1)
FROM tenants t
CROSS JOIN (VALUES
  ('5060', 'VMCC Commission & Handling', 'expense', '5100')
) AS v(code, name, type, parent_code)
WHERE NOT EXISTS (
  SELECT 1 FROM accounts a WHERE a.tenant_id = t.id AND a.code = v.code
);

COMMIT;
