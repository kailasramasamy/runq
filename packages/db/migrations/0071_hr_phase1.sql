-- 0071_hr_phase1.sql
-- HR Phase 1: employee master + attendance.
-- Adds: departments, designations, employees, shifts, employee_shifts,
-- attendance, biometric_imports, holidays.

DO $$ BEGIN
  CREATE TYPE employment_type AS ENUM ('permanent', 'contract', 'intern', 'consultant', 'wage');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE employee_status AS ENUM ('active', 'inactive', 'terminated', 'on_leave');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE gender AS ENUM ('male', 'female', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE attendance_status AS ENUM ('present', 'absent', 'half_day', 'leave', 'holiday', 'week_off');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE attendance_source AS ENUM ('manual', 'biometric', 'mobile', 'import');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE holiday_type AS ENUM ('national', 'state', 'company', 'optional');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name VARCHAR(100) NOT NULL,
  code VARCHAR(20),
  parent_id UUID,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dept_tenant ON departments(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_dept_tenant_name ON departments(tenant_id, name);

CREATE TABLE IF NOT EXISTS designations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name VARCHAR(100) NOT NULL,
  level INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_desig_tenant ON designations(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_desig_tenant_name ON designations(tenant_id, name);

CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  employee_code VARCHAR(30) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100),
  email VARCHAR(255),
  phone VARCHAR(20),
  date_of_birth DATE,
  gender gender,
  blood_group VARCHAR(5),
  address TEXT,
  joining_date DATE NOT NULL,
  confirmation_date DATE,
  exit_date DATE,
  status employee_status NOT NULL DEFAULT 'active',
  employment_type employment_type NOT NULL DEFAULT 'permanent',
  branch_id UUID,
  department_id UUID REFERENCES departments(id),
  designation_id UUID REFERENCES designations(id),
  reporting_to_id UUID,
  pan VARCHAR(10),
  aadhaar VARCHAR(12),
  uan VARCHAR(12),
  pf_number VARCHAR(30),
  esi_number VARCHAR(20),
  bank_account_number VARCHAR(30),
  bank_ifsc VARCHAR(11),
  bank_name VARCHAR(100),
  ctc_annual NUMERIC(15, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_emp_tenant_status ON employees(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_emp_tenant_dept ON employees(tenant_id, department_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_emp_tenant_code ON employees(tenant_id, employee_code);

CREATE TABLE IF NOT EXISTS shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name VARCHAR(50) NOT NULL,
  start_time VARCHAR(5) NOT NULL,
  end_time VARCHAR(5) NOT NULL,
  break_minutes INTEGER NOT NULL DEFAULT 0,
  weekly_off_days JSONB NOT NULL DEFAULT '[0]'::jsonb,
  is_night_shift BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shift_tenant ON shifts(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_shift_tenant_name ON shifts(tenant_id, name);

CREATE TABLE IF NOT EXISTS employee_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  employee_id UUID NOT NULL REFERENCES employees(id),
  shift_id UUID NOT NULL REFERENCES shifts(id),
  effective_from DATE NOT NULL,
  effective_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_es_tenant_emp ON employee_shifts(tenant_id, employee_id);

CREATE TABLE IF NOT EXISTS attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  employee_id UUID NOT NULL REFERENCES employees(id),
  date DATE NOT NULL,
  shift_id UUID REFERENCES shifts(id),
  check_in VARCHAR(8),
  check_out VARCHAR(8),
  hours_worked NUMERIC(5, 2),
  ot_hours NUMERIC(5, 2),
  status attendance_status NOT NULL DEFAULT 'present',
  source attendance_source NOT NULL DEFAULT 'manual',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_att_tenant_date ON attendance(tenant_id, date);
CREATE INDEX IF NOT EXISTS idx_att_tenant_emp_date ON attendance(tenant_id, employee_id, date);
CREATE UNIQUE INDEX IF NOT EXISTS uq_att_emp_date ON attendance(employee_id, date);

CREATE TABLE IF NOT EXISTS biometric_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  file_name VARCHAR(255) NOT NULL,
  device_type VARCHAR(50),
  imported_by UUID NOT NULL REFERENCES users(id),
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_records INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_bio_imp_tenant ON biometric_imports(tenant_id);

CREATE TABLE IF NOT EXISTS holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name VARCHAR(100) NOT NULL,
  date DATE NOT NULL,
  type holiday_type NOT NULL DEFAULT 'company',
  state VARCHAR(50),
  is_paid BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hol_tenant_date ON holidays(tenant_id, date);
CREATE UNIQUE INDEX IF NOT EXISTS uq_hol_tenant_date_name ON holidays(tenant_id, date, name);
