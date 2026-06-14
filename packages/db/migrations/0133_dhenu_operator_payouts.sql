-- 0133_dhenu_operator_payouts.sql
--
-- Lightweight operator-payout tracking. One row per (operator, period) marked
-- paid, with amounts snapshotted at pay time (commission = node pour volume ×
-- rate, plus fixed salary + rent). Mirrors mpOperatorPayouts in
-- packages/db/src/schema/milk-procurement/operations.ts. Disbursement itself
-- still runs through AP/payroll — this only records what was paid.
--
-- Apply in native dev via scripts/run-sql.ts (drizzle-kit push is the prod path).

BEGIN;

CREATE TABLE IF NOT EXISTS mp_operator_payouts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  operator_id     uuid NOT NULL REFERENCES mp_node_operators(id),
  node_id         uuid NOT NULL REFERENCES mp_nodes(id),
  period_start    date NOT NULL,
  period_end      date NOT NULL,
  node_qty        numeric(12,3) NOT NULL DEFAULT 0,
  commission      numeric(15,2) NOT NULL DEFAULT 0,
  salary          numeric(15,2) NOT NULL DEFAULT 0,
  rent            numeric(15,2) NOT NULL DEFAULT 0,
  total           numeric(15,2) NOT NULL DEFAULT 0,
  payee_vendor_id uuid REFERENCES vendors(id),
  paid_on         date NOT NULL,
  reference       varchar(120),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- One payout per operator per exact period — blocks double-paying.
CREATE UNIQUE INDEX IF NOT EXISTS uq_mp_operator_payout_period
  ON mp_operator_payouts (tenant_id, operator_id, period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_mp_operator_payout_node
  ON mp_operator_payouts (tenant_id, node_id, period_start);

COMMIT;
