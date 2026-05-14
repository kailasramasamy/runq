-- 0073_hr_phase3_payroll.sql
-- HR Phase 3: payroll — components, structures, employee salaries, runs, payslips.

DO $$ BEGIN
  CREATE TYPE salary_component_type AS ENUM ('earning', 'deduction', 'reimbursement', 'statutory');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE salary_calc_type AS ENUM ('fixed', 'percent_of_basic', 'percent_of_ctc', 'formula');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payroll_run_status AS ENUM ('draft', 'processed', 'approved', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS salary_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name VARCHAR(50) NOT NULL,
  code VARCHAR(20) NOT NULL,
  type salary_component_type NOT NULL DEFAULT 'earning',
  calc_type salary_calc_type NOT NULL DEFAULT 'fixed',
  default_value NUMERIC(12, 2) NOT NULL DEFAULT 0,
  is_taxable BOOLEAN NOT NULL DEFAULT TRUE,
  is_pf_applicable BOOLEAN NOT NULL DEFAULT FALSE,
  is_esi_applicable BOOLEAN NOT NULL DEFAULT FALSE,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sc_tenant ON salary_components(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sc_tenant_code ON salary_components(tenant_id, code);

CREATE TABLE IF NOT EXISTS salary_structures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ss_tenant ON salary_structures(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ss_tenant_name ON salary_structures(tenant_id, name);

CREATE TABLE IF NOT EXISTS salary_structure_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  salary_structure_id UUID NOT NULL REFERENCES salary_structures(id) ON DELETE CASCADE,
  salary_component_id UUID NOT NULL REFERENCES salary_components(id),
  value NUMERIC(12, 2) NOT NULL DEFAULT 0,
  calc_type salary_calc_type NOT NULL DEFAULT 'fixed'
);
CREATE INDEX IF NOT EXISTS idx_ssc_tenant_struct ON salary_structure_components(tenant_id, salary_structure_id);

CREATE TABLE IF NOT EXISTS employee_salary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  employee_id UUID NOT NULL REFERENCES employees(id),
  salary_structure_id UUID REFERENCES salary_structures(id),
  ctc_annual NUMERIC(15, 2) NOT NULL,
  effective_from VARCHAR(10) NOT NULL,
  effective_to VARCHAR(10),
  components_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_es_tenant_emp ON employee_salary(tenant_id, employee_id);

CREATE TABLE IF NOT EXISTS payroll_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  status payroll_run_status NOT NULL DEFAULT 'draft',
  total_employees INTEGER NOT NULL DEFAULT 0,
  total_gross NUMERIC(15, 2) NOT NULL DEFAULT 0,
  total_deductions NUMERIC(15, 2) NOT NULL DEFAULT 0,
  total_net NUMERIC(15, 2) NOT NULL DEFAULT 0,
  processed_by UUID REFERENCES users(id),
  processed_at TIMESTAMPTZ,
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pr_tenant_status ON payroll_runs(tenant_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pr_tenant_month ON payroll_runs(tenant_id, year, month);

CREATE TABLE IF NOT EXISTS payslips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  payroll_run_id UUID NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id),
  working_days NUMERIC(5, 2) NOT NULL DEFAULT 0,
  present_days NUMERIC(5, 2) NOT NULL DEFAULT 0,
  lop_days NUMERIC(5, 2) NOT NULL DEFAULT 0,
  paid_days NUMERIC(5, 2) NOT NULL DEFAULT 0,
  ot_hours NUMERIC(6, 2) NOT NULL DEFAULT 0,
  earnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  deductions JSONB NOT NULL DEFAULT '[]'::jsonb,
  gross NUMERIC(15, 2) NOT NULL DEFAULT 0,
  total_deductions NUMERIC(15, 2) NOT NULL DEFAULT 0,
  net_pay NUMERIC(15, 2) NOT NULL DEFAULT 0,
  pf_employee NUMERIC(12, 2) NOT NULL DEFAULT 0,
  pf_employer NUMERIC(12, 2) NOT NULL DEFAULT 0,
  esi_employee NUMERIC(12, 2) NOT NULL DEFAULT 0,
  esi_employer NUMERIC(12, 2) NOT NULL DEFAULT 0,
  tds NUMERIC(12, 2) NOT NULL DEFAULT 0,
  pt NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ps_tenant_run ON payslips(tenant_id, payroll_run_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ps_run_employee ON payslips(payroll_run_id, employee_id);
