-- Gender eligibility on leave types. Today every employee sees a row for
-- every leave type — Ramesh (male) shows ML 182 on his Home, which is
-- nonsense. This column lets the leave-balance lookup hide types that
-- don't apply.
--
-- 'all'    — visible to every employee regardless of gender (CL, SL, EL, ...)
-- 'male'   — visible only when employees.gender = 'male' (e.g. paternity)
-- 'female' — visible only when employees.gender = 'female' (e.g. maternity)
--
-- Employees with NULL gender are treated strictly: they see only 'all'
-- types until HR sets their gender on the employee record. Safer than
-- showing potentially-irrelevant types by default.

ALTER TABLE leave_types
  ADD COLUMN IF NOT EXISTS applicable_gender VARCHAR(10) NOT NULL DEFAULT 'all';

ALTER TABLE leave_types
  DROP CONSTRAINT IF EXISTS leave_types_applicable_gender_check;
ALTER TABLE leave_types
  ADD CONSTRAINT leave_types_applicable_gender_check
    CHECK (applicable_gender IN ('all', 'male', 'female'));

-- Backfill the canonical Indian-payroll gender-gated types. ML covers
-- the 26-week statutory maternity entitlement; PAT (paternity) is policy
-- not statute but commonly male-only in private-sector setups.
UPDATE leave_types SET applicable_gender = 'female' WHERE code = 'ML';
UPDATE leave_types SET applicable_gender = 'male'   WHERE code = 'PAT';
