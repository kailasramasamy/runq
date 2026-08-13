-- Backfill employee_salary assignments from employees.ctc_annual.
--
-- Salary lives in two places: employees.ctc_annual (what the employee form
-- captures and the profile displays) and employee_salary (the effective-dated
-- assignment payroll actually reads). assign() mirrored CTC down onto the
-- employee row, but the employee form never wrote back up — so an employee
-- given a CTC through the form had no assignment, and payroll skipped them
-- entirely (`if (!salary) continue`) while their profile showed a salary.
--
-- EmployeeService now keeps the two in step going forward. This creates the
-- missing rows for everyone onboarded before that.
--
-- Deliberately conservative:
--   * only active, non-deleted employees with a real CTC
--   * only those with NO assignment at all — an employee whose two figures
--     disagree is left alone, because picking one would be guessing at
--     somebody's pay. They keep being paid on their existing assignment.
--   * effective from the joining date, so past months price correctly
--   * no structure: process() derives a 40/40/20 split from CTC when the
--     snapshot is empty, which is what an unstructured assignment does anyway

INSERT INTO employee_salary (
  tenant_id, employee_id, salary_structure_id, ctc_annual,
  effective_from, components_snapshot
)
SELECT
  e.tenant_id,
  e.id,
  NULL,
  e.ctc_annual,
  e.joining_date,
  '[]'::jsonb
FROM employees e
WHERE e.status = 'active'
  AND e.deleted_at IS NULL
  AND e.ctc_annual IS NOT NULL
  AND e.ctc_annual > 0
  AND NOT EXISTS (
    SELECT 1 FROM employee_salary s WHERE s.employee_id = e.id
  );
