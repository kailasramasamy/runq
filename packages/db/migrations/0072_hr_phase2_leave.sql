-- 0072_hr_phase2_leave.sql
-- HR Phase 2: leave management — types, balances, requests.

DO $$ BEGIN
  CREATE TYPE leave_request_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS leave_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name VARCHAR(50) NOT NULL,
  code VARCHAR(10) NOT NULL,
  days_per_year NUMERIC(5, 2) NOT NULL DEFAULT 0,
  carry_forward BOOLEAN NOT NULL DEFAULT FALSE,
  max_carry_forward NUMERIC(5, 2),
  encashable BOOLEAN NOT NULL DEFAULT FALSE,
  is_paid BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lt_tenant ON leave_types(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_lt_tenant_code ON leave_types(tenant_id, code);

CREATE TABLE IF NOT EXISTS leave_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  employee_id UUID NOT NULL REFERENCES employees(id),
  leave_type_id UUID NOT NULL REFERENCES leave_types(id),
  year INTEGER NOT NULL,
  opening NUMERIC(6, 2) NOT NULL DEFAULT 0,
  accrued NUMERIC(6, 2) NOT NULL DEFAULT 0,
  used NUMERIC(6, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lb_tenant_emp ON leave_balances(tenant_id, employee_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_lb_emp_type_year ON leave_balances(employee_id, leave_type_id, year);

CREATE TABLE IF NOT EXISTS leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  employee_id UUID NOT NULL REFERENCES employees(id),
  leave_type_id UUID NOT NULL REFERENCES leave_types(id),
  from_date DATE NOT NULL,
  to_date DATE NOT NULL,
  half_day BOOLEAN NOT NULL DEFAULT FALSE,
  days NUMERIC(5, 2) NOT NULL,
  reason TEXT,
  status leave_request_status NOT NULL DEFAULT 'pending',
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lr_tenant_status ON leave_requests(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_lr_tenant_emp ON leave_requests(tenant_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_lr_tenant_dates ON leave_requests(tenant_id, from_date, to_date);
