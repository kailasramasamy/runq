-- Loan request policy + manager-approval flow.
-- Default policy keeps employee requests OFF so existing tenants are
-- unaffected; HR opts in per tenant on the /hr/loan-policy page.

ALTER TYPE loan_status ADD VALUE IF NOT EXISTS 'manager_approved';

ALTER TABLE employee_loans
  ADD COLUMN IF NOT EXISTS manager_approved_by uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS manager_approved_at timestamptz;

CREATE TABLE IF NOT EXISTS hr_loan_policy (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id),
  employee_requests_enabled boolean NOT NULL DEFAULT false,
  min_tenure_days integer NOT NULL DEFAULT 180,
  max_pct_of_monthly_ctc integer NOT NULL DEFAULT 50,
  max_active_loans integer NOT NULL DEFAULT 1,
  manager_approval_required boolean NOT NULL DEFAULT true,
  allowed_kinds text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
