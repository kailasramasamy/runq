-- Contracts, reshaped around how labour is actually engaged.
--
-- The first cut assumed a contract belonged to an `employees` row and was
-- priced either per day or as a lump sum. Real engagements come in three
-- shapes, and two of them have no employee record at all:
--
--   solo_daily    one worker on a daily rate
--   task_lumpsum  an agreed price for a job ("₹15,000 to lay the plant
--                 flooring"); we deal with the crew lead and do not care
--                 how many people he brings
--   crew_daily    a named crew, each on their own rate (mason ₹1,200,
--                 assistant ₹800, helper ₹500)
--
-- Solo is modelled as a crew of one. That collapses the calendar, the
-- earnings maths and the settlement into a single path instead of three:
-- rates live on `contract_members`, never on the contract.
--
-- Terms are frequently open-ended — work runs until it is done — so
-- `end_date` is nullable and earnings accrue to today until settled.
--
-- Data from the previous shape is carried forward rather than dropped:
-- an advance already posted a journal entry, and deleting the row would
-- strand that JE's source_id against nothing.

CREATE TYPE contract_type AS ENUM ('solo_daily', 'task_lumpsum', 'crew_daily');
CREATE TYPE contract_day_status AS ENUM ('worked', 'leave', 'half_day');
-- Renamed from employee_contract_status / employee_advance_status: nothing
-- about either is employee-scoped any more. The old types are dropped at
-- the foot of this migration once their tables are gone.
CREATE TYPE contract_status AS ENUM ('active', 'completed', 'cancelled');
CREATE TYPE advance_status AS ENUM ('paid', 'recovered', 'cancelled');
-- contract_settlement_status is reused from 0187 as-is.

CREATE TABLE labour_contracts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  contract_number VARCHAR(30) NOT NULL,
  -- What the job is, e.g. "Warehouse flooring". Not a person's name.
  name            VARCHAR(200) NOT NULL,
  lead_person_name  VARCHAR(150) NOT NULL,
  lead_person_phone VARCHAR(20),
  contract_type   contract_type NOT NULL,
  -- Only meaningful for task_lumpsum; daily rates live on members.
  fixed_amount    NUMERIC(15, 2),
  start_date      DATE NOT NULL,
  -- NULL = open-ended, runs until the work is complete. Stamped when the
  -- contract is settled.
  end_date        DATE,
  status          contract_status NOT NULL DEFAULT 'active',
  notes           TEXT,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_labour_contract_dates CHECK (end_date IS NULL OR end_date >= start_date),
  CONSTRAINT ck_labour_contract_amount CHECK (
    (contract_type = 'task_lumpsum' AND fixed_amount IS NOT NULL)
    OR (contract_type <> 'task_lumpsum' AND fixed_amount IS NULL)
  )
);

CREATE INDEX idx_labour_contract_tenant_status ON labour_contracts (tenant_id, status);
CREATE UNIQUE INDEX uq_labour_contract_number ON labour_contracts (tenant_id, contract_number);

-- One row per person on a day-rate contract. A solo_daily contract has
-- exactly one; a task_lumpsum has none.
CREATE TABLE contract_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  contract_id UUID NOT NULL REFERENCES labour_contracts(id) ON DELETE CASCADE,
  name        VARCHAR(150) NOT NULL,
  -- Free text: mason, assistant, helper. Not an enum — trades vary.
  role        VARCHAR(80),
  daily_rate  NUMERIC(10, 2) NOT NULL,
  -- Members join and leave mid-term; earnings only accrue inside this window.
  joined_on   DATE,
  left_on     DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_contract_member_rate CHECK (daily_rate > 0),
  CONSTRAINT ck_contract_member_dates CHECK (left_on IS NULL OR joined_on IS NULL OR left_on >= joined_on)
);

CREATE INDEX idx_contract_member_contract ON contract_members (contract_id);

-- EXCEPTIONS ONLY.
--
-- Every day from the start date counts as worked. Storing a row per worked
-- day would need a scheduler to keep an open-ended contract current and
-- would grow without bound; storing only the days that deviate keeps the
-- calendar correct with no background job at all.
CREATE TABLE contract_day_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  contract_id UUID NOT NULL REFERENCES labour_contracts(id) ON DELETE CASCADE,
  member_id   UUID NOT NULL REFERENCES contract_members(id) ON DELETE CASCADE,
  log_date    DATE NOT NULL,
  status      contract_day_status NOT NULL,
  note        TEXT,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_contract_day ON contract_day_log (member_id, log_date);
CREATE INDEX idx_contract_day_contract ON contract_day_log (contract_id, log_date);

-- Advances. `member_id` is null on a task_lumpsum contract, where the money
-- goes to the crew lead and there are no members to attribute it to.
CREATE TABLE contract_advances (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id),
  contract_id      UUID NOT NULL REFERENCES labour_contracts(id),
  member_id        UUID REFERENCES contract_members(id),
  amount           NUMERIC(15, 2) NOT NULL,
  paid_on          DATE NOT NULL,
  payment_method   VARCHAR(30) NOT NULL DEFAULT 'cash',
  bank_account_id  UUID,
  reference        VARCHAR(100),
  notes            TEXT,
  status           advance_status NOT NULL DEFAULT 'paid',
  settlement_id    UUID,
  journal_entry_id UUID,
  created_by       UUID REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_contract_advance_amount CHECK (amount > 0)
);

CREATE INDEX idx_contract_advance_contract ON contract_advances (contract_id);
CREATE INDEX idx_contract_advance_member ON contract_advances (member_id);

CREATE TABLE labour_settlements (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id),
  contract_id        UUID NOT NULL REFERENCES labour_contracts(id),
  settlement_number  VARCHAR(30) NOT NULL,
  from_date          DATE NOT NULL,
  -- The through-date the settlement was computed to. For an open-ended
  -- contract this is what gets stamped onto end_date on approval.
  to_date            DATE NOT NULL,
  earned             NUMERIC(15, 2) NOT NULL DEFAULT 0,
  advances_recovered NUMERIC(15, 2) NOT NULL DEFAULT 0,
  other_deductions   NUMERIC(15, 2) NOT NULL DEFAULT 0,
  net_payable        NUMERIC(15, 2) NOT NULL DEFAULT 0,
  status             contract_settlement_status NOT NULL DEFAULT 'draft',
  notes              TEXT,
  journal_entry_id   UUID,
  approved_by        UUID REFERENCES users(id),
  approved_at        TIMESTAMPTZ,
  paid_at            TIMESTAMPTZ,
  created_by         UUID REFERENCES users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_labour_settlement_dates CHECK (to_date >= from_date)
);

CREATE INDEX idx_labour_settlement_tenant_status ON labour_settlements (tenant_id, status);
CREATE UNIQUE INDEX uq_labour_settlement_number ON labour_settlements (tenant_id, settlement_number);

-- Per-member breakdown. A crew is settled person by person — the mason and
-- the helper are paid separately — so the header totals alone would not
-- tell anyone what to hand over.
--
-- `member_name` and `daily_rate` are denormalised on purpose: a settlement
-- is a record of what was agreed and paid at that moment, and editing the
-- member later must not rewrite history.
CREATE TABLE labour_settlement_lines (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id),
  settlement_id      UUID NOT NULL REFERENCES labour_settlements(id) ON DELETE CASCADE,
  member_id          UUID REFERENCES contract_members(id),
  member_name        VARCHAR(150) NOT NULL,
  member_role        VARCHAR(80),
  days_worked        NUMERIC(6, 1) NOT NULL DEFAULT 0,
  daily_rate         NUMERIC(10, 2),
  earned             NUMERIC(15, 2) NOT NULL DEFAULT 0,
  advances_recovered NUMERIC(15, 2) NOT NULL DEFAULT 0,
  net_payable        NUMERIC(15, 2) NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_labour_settlement_line_settlement ON labour_settlement_lines (settlement_id);

-- ── Carry the previous shape forward ────────────────────────────────────
--
-- IDs are preserved so any journal entry already posted against an advance
-- keeps pointing at a live row.

INSERT INTO labour_contracts (
  id, tenant_id, contract_number, name, lead_person_name, contract_type,
  fixed_amount, start_date, end_date, status, notes, created_by, created_at
)
SELECT
  c.id,
  c.tenant_id,
  c.contract_number,
  -- No contract name existed before; the worker's name is the best label.
  COALESCE(e.first_name || COALESCE(' ' || e.last_name, ''), c.contract_number),
  COALESCE(e.first_name || COALESCE(' ' || e.last_name, ''), 'Unknown'),
  CASE WHEN c.comp_basis = 'fixed' THEN 'task_lumpsum'::contract_type
       ELSE 'solo_daily'::contract_type END,
  c.fixed_amount,
  c.start_date,
  c.end_date,
  c.status::text::contract_status,
  c.notes,
  c.created_by,
  c.created_at
FROM employee_contracts c
LEFT JOIN employees e ON e.id = c.employee_id;

-- A daily-wage contract becomes a crew of one, carrying its rate.
INSERT INTO contract_members (tenant_id, contract_id, name, daily_rate)
SELECT c.tenant_id, c.id,
       COALESCE(e.first_name || COALESCE(' ' || e.last_name, ''), 'Worker'),
       c.daily_rate
FROM employee_contracts c
LEFT JOIN employees e ON e.id = c.employee_id
WHERE c.comp_basis = 'daily_wage' AND c.daily_rate IS NOT NULL;

INSERT INTO contract_advances (
  id, tenant_id, contract_id, member_id, amount, paid_on, payment_method,
  bank_account_id, reference, notes, status, journal_entry_id, created_by, created_at
)
SELECT
  a.id, a.tenant_id, a.contract_id,
  (SELECT m.id FROM contract_members m WHERE m.contract_id = a.contract_id LIMIT 1),
  a.amount, a.paid_on, a.payment_method, a.bank_account_id, a.reference,
  -- Via text: the old and new enums are distinct types even though their
  -- labels match, so Postgres will not coerce between them directly.
  a.notes, a.status::text::advance_status, a.journal_entry_id, a.created_by, a.created_at
FROM employee_advances a;

-- Order matters: employee_advances holds FKs to both of the others, and
-- contract_settlements holds one to employee_contracts.
DROP TABLE employee_advances;
DROP TABLE contract_settlements;
DROP TABLE employee_contracts;

DROP TYPE contract_comp_basis;
DROP TYPE employee_contract_status;
DROP TYPE employee_advance_status;
