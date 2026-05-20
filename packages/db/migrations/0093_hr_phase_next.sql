-- 0093_hr_phase_next.sql
-- Phase-next HR features (10 capabilities):
--   - geo_fences + attendance_punches            (mobile geo check-in)
--   - attendance_regularizations                 (missed-punch fix workflow)
--   - tax_declarations + tax_declaration_items   (Form 12BB)
--   - employee_loans + employee_loan_instalments (loans / advances)
--   - fnf_settlements                            (full & final on exit)
--   - onboarding_templates(+items), onboarding_workflows(+items)
--   - letter_templates + employee_letters
--   - hr_tickets + hr_ticket_comments
--   - performance_cycles, performance_goals, performance_reviews
--
-- All tables are tenant-scoped, use UUID PKs, and follow the existing
-- HR-module conventions: created_at/updated_at, timestamp with time zone.

-- ===== ENUMS =====
DO $$ BEGIN CREATE TYPE punch_kind AS ENUM ('in','out'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE regularization_status AS ENUM ('pending','approved','rejected','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE declaration_status AS ENUM ('draft','submitted','approved','rejected'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE tax_regime AS ENUM ('old','new'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE loan_status AS ENUM ('draft','active','closed','written_off'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE loan_kind AS ENUM ('advance','personal','festival','education','other'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE fnf_status AS ENUM ('draft','approved','paid','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE onboarding_status AS ENUM ('in_progress','completed','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE onboarding_item_kind AS ENUM ('document_upload','task','acknowledgement','asset_issue','induction'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE letter_kind AS ENUM ('offer','appointment','confirmation','increment','experience','relieving','salary_certificate','address_proof','other'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE letter_status AS ENUM ('draft','issued','revoked'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE hr_ticket_status AS ENUM ('open','in_progress','resolved','closed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE hr_ticket_priority AS ENUM ('low','normal','high','urgent'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE hr_ticket_category AS ENUM ('payroll','leave','attendance','reimbursement','asset','it','document','general'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE perf_cycle_status AS ENUM ('planned','active','review','closed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE perf_goal_status AS ENUM ('draft','active','achieved','partially_achieved','not_achieved','dropped'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE perf_review_status AS ENUM ('pending','self_submitted','manager_submitted','finalised'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ===== GEO FENCES + ATTENDANCE PUNCHES =====
CREATE TABLE IF NOT EXISTS geo_fences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  name varchar(100) NOT NULL,
  latitude decimal(10,7) NOT NULL,
  longitude decimal(10,7) NOT NULL,
  radius_meters integer NOT NULL DEFAULT 200,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_geo_tenant ON geo_fences(tenant_id);

CREATE TABLE IF NOT EXISTS attendance_punches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  employee_id uuid NOT NULL REFERENCES employees(id),
  punch_at timestamptz NOT NULL,
  kind punch_kind NOT NULL,
  latitude decimal(10,7),
  longitude decimal(10,7),
  accuracy_meters decimal(8,2),
  inside_fence boolean NOT NULL DEFAULT false,
  geo_fence_id uuid REFERENCES geo_fences(id),
  selfie_url varchar(500),
  notes varchar(500),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_punch_tenant_emp_at ON attendance_punches(tenant_id, employee_id, punch_at);

-- ===== ATTENDANCE REGULARIZATIONS =====
CREATE TABLE IF NOT EXISTS attendance_regularizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  employee_id uuid NOT NULL REFERENCES employees(id),
  date date NOT NULL,
  requested_check_in varchar(8),
  requested_check_out varchar(8),
  requested_status varchar(20),
  reason text NOT NULL,
  status regularization_status NOT NULL DEFAULT 'pending',
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reg_tenant_status ON attendance_regularizations(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_reg_tenant_emp ON attendance_regularizations(tenant_id, employee_id);

-- ===== TAX DECLARATIONS (Form 12BB) =====
CREATE TABLE IF NOT EXISTS tax_declarations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  employee_id uuid NOT NULL REFERENCES employees(id),
  financial_year varchar(9) NOT NULL,
  regime tax_regime NOT NULL DEFAULT 'new',
  status declaration_status NOT NULL DEFAULT 'draft',
  hra_total decimal(12,2) NOT NULL DEFAULT 0,
  lta_total decimal(12,2) NOT NULL DEFAULT 0,
  home_loan_interest decimal(12,2) NOT NULL DEFAULT 0,
  section_80c decimal(12,2) NOT NULL DEFAULT 0,
  section_80d decimal(12,2) NOT NULL DEFAULT 0,
  section_80g decimal(12,2) NOT NULL DEFAULT 0,
  section_80ccd_1b decimal(12,2) NOT NULL DEFAULT 0,
  other_deductions decimal(12,2) NOT NULL DEFAULT 0,
  notes text,
  submitted_at timestamptz,
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_taxdecl_tenant_status ON tax_declarations(tenant_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_taxdecl_emp_fy ON tax_declarations(employee_id, financial_year);

CREATE TABLE IF NOT EXISTS tax_declaration_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  declaration_id uuid NOT NULL REFERENCES tax_declarations(id) ON DELETE CASCADE,
  section varchar(30) NOT NULL,
  particulars varchar(200) NOT NULL,
  amount decimal(12,2) NOT NULL DEFAULT 0,
  meta jsonb,
  proof_url varchar(500),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_taxitem_decl ON tax_declaration_items(declaration_id);

-- ===== EMPLOYEE LOANS =====
CREATE TABLE IF NOT EXISTS employee_loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  employee_id uuid NOT NULL REFERENCES employees(id),
  kind loan_kind NOT NULL DEFAULT 'advance',
  principal decimal(15,2) NOT NULL,
  emi_amount decimal(15,2) NOT NULL,
  total_instalments integer NOT NULL,
  disbursed_on date NOT NULL,
  first_emi_month integer NOT NULL,
  first_emi_year integer NOT NULL,
  outstanding decimal(15,2) NOT NULL,
  status loan_status NOT NULL DEFAULT 'draft',
  reason text,
  created_by uuid REFERENCES users(id),
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_loan_tenant_status ON employee_loans(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_loan_tenant_emp ON employee_loans(tenant_id, employee_id);

CREATE TABLE IF NOT EXISTS employee_loan_instalments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  loan_id uuid NOT NULL REFERENCES employee_loans(id) ON DELETE CASCADE,
  sequence integer NOT NULL,
  due_month integer NOT NULL,
  due_year integer NOT NULL,
  amount decimal(15,2) NOT NULL,
  paid_payroll_run_id uuid REFERENCES payroll_runs(id),
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_loaninst_loan_seq ON employee_loan_instalments(loan_id, sequence);
CREATE INDEX IF NOT EXISTS idx_loaninst_tenant_due ON employee_loan_instalments(tenant_id, due_year, due_month);

-- ===== FULL & FINAL =====
CREATE TABLE IF NOT EXISTS fnf_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  employee_id uuid NOT NULL REFERENCES employees(id),
  resignation_date date,
  last_working_date date NOT NULL,
  notice_period_days decimal(5,1),
  notice_shortfall_days decimal(5,1) NOT NULL DEFAULT 0,
  last_month_salary decimal(15,2) NOT NULL DEFAULT 0,
  leave_encashment decimal(15,2) NOT NULL DEFAULT 0,
  gratuity decimal(15,2) NOT NULL DEFAULT 0,
  bonus_payable decimal(15,2) NOT NULL DEFAULT 0,
  other_earnings decimal(15,2) NOT NULL DEFAULT 0,
  notice_recovery decimal(15,2) NOT NULL DEFAULT 0,
  loan_recovery decimal(15,2) NOT NULL DEFAULT 0,
  tds decimal(15,2) NOT NULL DEFAULT 0,
  pf_deduction decimal(15,2) NOT NULL DEFAULT 0,
  other_deductions decimal(15,2) NOT NULL DEFAULT 0,
  gross_earnings decimal(15,2) NOT NULL DEFAULT 0,
  total_deductions decimal(15,2) NOT NULL DEFAULT 0,
  net_payable decimal(15,2) NOT NULL DEFAULT 0,
  status fnf_status NOT NULL DEFAULT 'draft',
  notes text,
  breakdown jsonb,
  je_id uuid,
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  paid_at timestamptz,
  pdf_url varchar(500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fnf_tenant_status ON fnf_settlements(tenant_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fnf_employee_active ON fnf_settlements(employee_id);

-- ===== ONBOARDING =====
CREATE TABLE IF NOT EXISTS onboarding_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  name varchar(100) NOT NULL,
  description text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_onbtmpl_tenant ON onboarding_templates(tenant_id);

CREATE TABLE IF NOT EXISTS onboarding_template_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES onboarding_templates(id) ON DELETE CASCADE,
  sequence integer NOT NULL,
  title varchar(200) NOT NULL,
  kind onboarding_item_kind NOT NULL DEFAULT 'task',
  assigned_role varchar(30) NOT NULL DEFAULT 'employee',
  due_days integer,
  instructions text
);
CREATE INDEX IF NOT EXISTS idx_onbtmplitem_tmpl ON onboarding_template_items(template_id);

CREATE TABLE IF NOT EXISTS onboarding_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  employee_id uuid NOT NULL REFERENCES employees(id),
  template_id uuid REFERENCES onboarding_templates(id),
  status onboarding_status NOT NULL DEFAULT 'in_progress',
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_onbwf_employee ON onboarding_workflows(employee_id);
CREATE INDEX IF NOT EXISTS idx_onbwf_tenant_status ON onboarding_workflows(tenant_id, status);

CREATE TABLE IF NOT EXISTS onboarding_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES onboarding_workflows(id) ON DELETE CASCADE,
  sequence integer NOT NULL,
  title varchar(200) NOT NULL,
  kind onboarding_item_kind NOT NULL DEFAULT 'task',
  assigned_role varchar(30) NOT NULL DEFAULT 'employee',
  instructions text,
  is_completed boolean NOT NULL DEFAULT false,
  completed_by uuid REFERENCES users(id),
  completed_at timestamptz,
  notes text
);
CREATE INDEX IF NOT EXISTS idx_onbitem_workflow ON onboarding_items(workflow_id);

-- ===== LETTERS =====
CREATE TABLE IF NOT EXISTS letter_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  name varchar(100) NOT NULL,
  kind letter_kind NOT NULL,
  subject varchar(200),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lettertmpl_tenant ON letter_templates(tenant_id);

CREATE TABLE IF NOT EXISTS employee_letters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  employee_id uuid NOT NULL REFERENCES employees(id),
  template_id uuid REFERENCES letter_templates(id),
  kind letter_kind NOT NULL,
  subject varchar(200),
  rendered_body text NOT NULL,
  tokens jsonb,
  status letter_status NOT NULL DEFAULT 'draft',
  issued_at timestamptz,
  issued_by uuid REFERENCES users(id),
  pdf_url varchar(500),
  emailed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_letter_tenant_emp ON employee_letters(tenant_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_letter_tenant_kind ON employee_letters(tenant_id, kind);

-- ===== HR HELPDESK =====
CREATE TABLE IF NOT EXISTS hr_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  ticket_number varchar(30) NOT NULL,
  employee_id uuid NOT NULL REFERENCES employees(id),
  category hr_ticket_category NOT NULL DEFAULT 'general',
  priority hr_ticket_priority NOT NULL DEFAULT 'normal',
  subject varchar(200) NOT NULL,
  description text,
  status hr_ticket_status NOT NULL DEFAULT 'open',
  assigned_to uuid REFERENCES users(id),
  sla_hours integer NOT NULL DEFAULT 48,
  resolved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ticket_tenant_status ON hr_tickets(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_ticket_tenant_emp ON hr_tickets(tenant_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_ticket_assigned ON hr_tickets(tenant_id, assigned_to);

CREATE TABLE IF NOT EXISTS hr_ticket_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES hr_tickets(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL REFERENCES users(id),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tcomment_ticket ON hr_ticket_comments(ticket_id);

-- ===== PERFORMANCE =====
CREATE TABLE IF NOT EXISTS performance_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  name varchar(100) NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  review_start_date date,
  review_end_date date,
  status perf_cycle_status NOT NULL DEFAULT 'planned',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_perfcycle_tenant ON performance_cycles(tenant_id);

CREATE TABLE IF NOT EXISTS performance_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  cycle_id uuid NOT NULL REFERENCES performance_cycles(id),
  employee_id uuid NOT NULL REFERENCES employees(id),
  title varchar(200) NOT NULL,
  description text,
  weight decimal(5,2) NOT NULL DEFAULT 0,
  target_metric varchar(200),
  status perf_goal_status NOT NULL DEFAULT 'active',
  self_rating decimal(3,1),
  manager_rating decimal(3,1),
  final_rating decimal(3,1),
  comments text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_perfgoal_cycle_emp ON performance_goals(cycle_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_perfgoal_tenant_emp ON performance_goals(tenant_id, employee_id);

CREATE TABLE IF NOT EXISTS performance_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  cycle_id uuid NOT NULL REFERENCES performance_cycles(id),
  employee_id uuid NOT NULL REFERENCES employees(id),
  manager_user_id uuid REFERENCES users(id),
  self_comments text,
  manager_comments text,
  self_overall_rating decimal(3,1),
  manager_overall_rating decimal(3,1),
  final_overall_rating decimal(3,1),
  status perf_review_status NOT NULL DEFAULT 'pending',
  self_submitted_at timestamptz,
  manager_submitted_at timestamptz,
  finalised_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_perfreview_cycle_emp ON performance_reviews(cycle_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_perfreview_tenant_status ON performance_reviews(tenant_id, status);
