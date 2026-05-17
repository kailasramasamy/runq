-- Optional department head. When set, that employee's hrAccessScope
-- includes everyone in the department in addition to their reporting
-- subtree — supports the People Ops case of "head of HR sees all of
-- HR" without putting every HR employee under one reportingToId.

ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS head_employee_id UUID;

CREATE INDEX IF NOT EXISTS idx_dept_tenant_head
  ON departments (tenant_id, head_employee_id);
