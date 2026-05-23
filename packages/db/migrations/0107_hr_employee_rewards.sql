-- 0107_hr_employee_rewards.sql
-- Rewards & spot bonuses: a manager initiates a reward for a report, HR
-- approves, and a monetary reward syncs to Finance (Dr 5205 Bonus &
-- Incentives / Cr 2114 Employee Rewards Payable on post; Dr 2114 / Cr bank
-- on payout via the employee_payments subledger). Recognition rewards carry
-- no money and are terminal at 'approved'.

CREATE TYPE reward_kind AS ENUM ('monetary', 'recognition');

CREATE TYPE reward_status AS ENUM (
  'draft', 'submitted', 'approved', 'rejected', 'posted', 'paid'
);

CREATE TABLE IF NOT EXISTS reward_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name VARCHAR(60) NOT NULL,
  code VARCHAR(20) NOT NULL,
  kind reward_kind NOT NULL DEFAULT 'monetary',
  gl_account_code VARCHAR(20) NOT NULL DEFAULT '5205',
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rt_tenant ON reward_types (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_rt_tenant_code ON reward_types (tenant_id, code);

CREATE TABLE IF NOT EXISTS employee_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  reward_number VARCHAR(50) NOT NULL,
  employee_id UUID NOT NULL REFERENCES employees(id),
  reward_type_id UUID NOT NULL REFERENCES reward_types(id),
  kind reward_kind NOT NULL DEFAULT 'monetary',
  amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
  title VARCHAR(120) NOT NULL,
  citation TEXT,
  award_date DATE NOT NULL,
  status reward_status NOT NULL DEFAULT 'draft',
  initiated_by UUID NOT NULL REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  gl_account_code VARCHAR(20),
  journal_entry_id UUID REFERENCES journal_entries(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_er_tenant_status ON employee_rewards (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_er_tenant_employee ON employee_rewards (tenant_id, employee_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_er_tenant_number ON employee_rewards (tenant_id, reward_number);

-- employee_payments gains a third settlement source.
ALTER TYPE employee_payment_source ADD VALUE IF NOT EXISTS 'employee_reward';

ALTER TABLE employee_payments
  ADD COLUMN IF NOT EXISTS employee_reward_id UUID REFERENCES employee_rewards(id);

CREATE INDEX IF NOT EXISTS idx_ep_tenant_reward
  ON employee_payments (tenant_id, employee_reward_id);

-- The reward payout credits 2114 Employee Rewards Payable; add it to every
-- existing tenant (new tenants get it from the standard chart-of-accounts seed).
INSERT INTO accounts (tenant_id, code, name, type, parent_id, is_active, is_system_account)
SELECT
  t.id,
  '2114',
  'Employee Rewards Payable',
  'liability'::account_type,
  (SELECT id FROM accounts WHERE tenant_id = t.id AND code = '2100' LIMIT 1),
  TRUE,
  FALSE
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM accounts a WHERE a.tenant_id = t.id AND a.code = '2114'
);
