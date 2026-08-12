-- Short-term contract / wage engagements: term, comp basis, advances, and
-- the settlement that closes them out.
--
-- These workers never fit the CTC payroll path. `payroll_runs` skips anyone
-- without a salary structure, so a worker carrying only a daily rate was
-- silently unpaid by every run — their money now moves through
-- contract_settlements instead.
--
-- The term lives on its own table rather than as columns on `employees`
-- because a seasonal worker is re-engaged: that is a second contract row,
-- not an overwrite of the first one's history.

CREATE TYPE contract_comp_basis AS ENUM ('daily_wage', 'fixed');
CREATE TYPE employee_contract_status AS ENUM ('active', 'completed', 'cancelled');
CREATE TYPE employee_advance_status AS ENUM ('paid', 'recovered', 'cancelled');
CREATE TYPE contract_settlement_status AS ENUM ('draft', 'approved', 'paid', 'cancelled');

CREATE TABLE employee_contracts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  employee_id     UUID NOT NULL REFERENCES employees(id),
  contract_number VARCHAR(30) NOT NULL,
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  comp_basis      contract_comp_basis NOT NULL,
  daily_rate      NUMERIC(10, 2),
  fixed_amount    NUMERIC(15, 2),
  status          employee_contract_status NOT NULL DEFAULT 'active',
  notes           TEXT,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_emp_contract_dates CHECK (end_date >= start_date),
  -- A daily-wage contract prices days; a fixed one prices the term. Holding
  -- both would leave the settlement guessing which figure to believe.
  CONSTRAINT ck_emp_contract_comp CHECK (
    (comp_basis = 'daily_wage' AND daily_rate IS NOT NULL AND fixed_amount IS NULL)
    OR (comp_basis = 'fixed' AND fixed_amount IS NOT NULL AND daily_rate IS NULL)
  )
);

CREATE INDEX idx_emp_contract_tenant_status ON employee_contracts (tenant_id, status);
CREATE INDEX idx_emp_contract_tenant_emp ON employee_contracts (tenant_id, employee_id);
CREATE UNIQUE INDEX uq_emp_contract_number ON employee_contracts (tenant_id, contract_number);

-- NOTE ON THE OVERLAP GUARD
-- One live engagement at a time per worker: overlapping active contracts
-- would make "days worked in the term" ambiguous, pricing the same
-- attendance day under two rates.
--
-- That would naturally be an EXCLUDE USING gist over
-- daterange(start_date, end_date), but prod deploys through drizzle-kit
-- push, which chokes on expression indexes and would not carry the
-- constraint anyway (it isn't expressible in the drizzle schema). The guard
-- therefore lives in ContractService.assertNoOverlap — see the tests in
-- contract.service.test.ts.

CREATE TABLE employee_advances (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  employee_id     UUID NOT NULL REFERENCES employees(id),
  contract_id     UUID REFERENCES employee_contracts(id),
  amount          NUMERIC(15, 2) NOT NULL,
  paid_on         DATE NOT NULL,
  payment_method  VARCHAR(30) NOT NULL DEFAULT 'cash',
  bank_account_id UUID,
  reference       VARCHAR(100),
  notes           TEXT,
  status          employee_advance_status NOT NULL DEFAULT 'paid',
  settlement_id   UUID,
  journal_entry_id UUID,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_emp_advance_amount CHECK (amount > 0)
);

CREATE INDEX idx_emp_advance_tenant_emp ON employee_advances (tenant_id, employee_id);
CREATE INDEX idx_emp_advance_contract ON employee_advances (contract_id);

CREATE TABLE contract_settlements (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id),
  contract_id        UUID NOT NULL REFERENCES employee_contracts(id),
  employee_id        UUID NOT NULL REFERENCES employees(id),
  settlement_number  VARCHAR(30) NOT NULL,
  from_date          DATE NOT NULL,
  to_date            DATE NOT NULL,
  days_worked        NUMERIC(6, 1) NOT NULL DEFAULT 0,
  earned             NUMERIC(15, 2) NOT NULL DEFAULT 0,
  advances_recovered NUMERIC(15, 2) NOT NULL DEFAULT 0,
  other_deductions   NUMERIC(15, 2) NOT NULL DEFAULT 0,
  net_payable        NUMERIC(15, 2) NOT NULL DEFAULT 0,
  status             contract_settlement_status NOT NULL DEFAULT 'draft',
  notes              TEXT,
  breakdown          JSONB,
  journal_entry_id   UUID,
  payment_id         UUID,
  approved_by        UUID REFERENCES users(id),
  approved_at        TIMESTAMPTZ,
  paid_at            TIMESTAMPTZ,
  created_by         UUID REFERENCES users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_contract_settlement_dates CHECK (to_date >= from_date)
);

CREATE INDEX idx_contract_settlement_tenant_status ON contract_settlements (tenant_id, status);
CREATE INDEX idx_contract_settlement_emp ON contract_settlements (tenant_id, employee_id);
CREATE UNIQUE INDEX uq_contract_settlement_number ON contract_settlements (tenant_id, settlement_number);

-- A contract settles once; a cancelled attempt frees the slot for a redo.
-- Same reasoning as the overlap guard above — a partial unique index does
-- not survive the drizzle-kit push deploy path, so the rule is enforced in
-- SettlementService.create.

ALTER TABLE employee_advances
  ADD CONSTRAINT fk_emp_advance_settlement
  FOREIGN KEY (settlement_id) REFERENCES contract_settlements(id);

-- 1122 Employee Advances — asset. An advance is money owed back by the
-- worker until settlement clears it, so it must not touch P&L. The wage
-- expense lands once, at settlement.
--
-- Not 1117, the next free code in the standard chart: at least one existing
-- tenant had already taken 1117 for "Inter-Bank Transfer Clearing", and a
-- plain NOT EXISTS guard would have skipped that tenant silently, leaving
-- every advance there posting into an unrelated clearing account.
INSERT INTO accounts (tenant_id, code, name, type, parent_id, is_system_account)
SELECT
  parent.tenant_id,
  '1122',
  'Employee Advances',
  'asset'::account_type,
  parent.id,
  TRUE
FROM accounts parent
WHERE parent.code = '1100'
  AND NOT EXISTS (
    SELECT 1 FROM accounts existing
    WHERE existing.tenant_id = parent.tenant_id
      AND existing.code = '1122'
  );

-- Fail loudly rather than leave a tenant posting advances somewhere wrong.
-- The INSERT above is idempotent by design, which also means it quietly does
-- nothing when the code is occupied — this turns that silence into an error.
DO $$
DECLARE
  bad_tenant UUID;
BEGIN
  SELECT parent.tenant_id INTO bad_tenant
  FROM accounts parent
  WHERE parent.code = '1100'
    AND NOT EXISTS (
      SELECT 1 FROM accounts a
      WHERE a.tenant_id = parent.tenant_id
        AND a.code = '1122'
        AND a.name = 'Employee Advances'
    )
  LIMIT 1;

  IF bad_tenant IS NOT NULL THEN
    RAISE EXCEPTION
      'Tenant % already uses account code 1122 for something else. Pick a free code for Employee Advances before deploying.',
      bad_tenant;
  END IF;
END $$;
