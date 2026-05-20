-- Leave accrual mode + per-balance month cursor.
--
-- Today every leave_balance row carries the full year's accrual on day one
-- — the home screen shows "182 ML" for someone whose maternity entitlement
-- vests across 26 weeks, not on Jan 1. This migration adds the columns the
-- accrual scheduler needs to ramp `accrued` month-by-month for types that
-- should accrue (typically EL/PL) while leaving upfront types (CL, SL, ML,
-- CO, LOP) alone.
--
-- accrual_mode on leave_types:
--   upfront   — full daysPerYear granted at year start (default; keeps
--               existing behaviour for CL/SL/ML/etc.)
--   monthly   — 1/12th of daysPerYear added each month, tracked via
--               last_accrued_month on the balance row
--   quarterly — reserved; scheduler may add this later (1/4th every 3 mo)
--
-- last_accrued_month on leave_balances:
--   0 = nothing accrued yet (fresh January for a monthly-mode row)
--   12 = fully accrued for the year (upfront, or year-end roll-up)
-- Stored per row so partial-year joiners and mid-year onboarding stay
-- correct without touching the leave_types config.

ALTER TABLE leave_types
  ADD COLUMN IF NOT EXISTS accrual_mode VARCHAR(20) NOT NULL DEFAULT 'upfront';

ALTER TABLE leave_types
  DROP CONSTRAINT IF EXISTS leave_types_accrual_mode_check;
ALTER TABLE leave_types
  ADD CONSTRAINT leave_types_accrual_mode_check
    CHECK (accrual_mode IN ('upfront', 'monthly', 'quarterly'));

ALTER TABLE leave_balances
  ADD COLUMN IF NOT EXISTS last_accrued_month SMALLINT NOT NULL DEFAULT 12;

ALTER TABLE leave_balances
  DROP CONSTRAINT IF EXISTS leave_balances_last_accrued_month_check;
ALTER TABLE leave_balances
  ADD CONSTRAINT leave_balances_last_accrued_month_check
    CHECK (last_accrued_month BETWEEN 0 AND 12);

-- Backfill: convert EL / PL (Earned Leave / Privilege Leave) to monthly
-- accrual everywhere. These are the canonical accrual-style types in
-- Indian payroll; CL/SL/ML/CO/LOP stay upfront. Tenants can flip more
-- types via the leave-types admin screen.
UPDATE leave_types
   SET accrual_mode = 'monthly'
 WHERE code IN ('EL', 'PL');

-- Re-grade existing balance rows for the *current* year only:
--   - monthly types: rewrite `accrued` to (daysPerYear / 12) * elapsed_months
--     and set last_accrued_month so the scheduler picks up from here.
--   - upfront types: leave `accrued` alone, mark last_accrued_month = 12 so
--     the scheduler skips them.
-- We use the database server's calendar — close enough for a one-shot
-- backfill; the scheduler is the long-term source of truth.
WITH cur AS (
  SELECT EXTRACT(MONTH FROM CURRENT_DATE)::int AS m,
         EXTRACT(YEAR  FROM CURRENT_DATE)::int AS y
)
UPDATE leave_balances lb
   SET accrued = ROUND((lt.days_per_year::numeric / 12.0) * cur.m, 2),
       last_accrued_month = cur.m
  FROM leave_types lt, cur
 WHERE lt.id = lb.leave_type_id
   AND lt.accrual_mode = 'monthly'
   AND lb.year = cur.y;
