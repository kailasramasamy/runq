-- One-off: re-sync leave_balances.accrued to the current leave_types quota.
--
-- Balance rows snapshot days_per_year when they are provisioned, so quota
-- edits made on /hr/leave-types never reached employees who were already
-- provisioned — and "Initialize balances" could not fix them either, since it
-- only inserts missing rows. LeaveTypeService.update() now re-syncs on every
-- quota edit; this repairs the rows edited before that shipped.
--
-- Mirrors proratedAccrued() in leave-balance.service.ts exactly:
--   * 0-day types (comp-off, LOP) and event leave over 60d pass through
--     unprorated
--   * joined in a prior year  -> full quota
--   * joined later than the target year -> 0
--   * joined during the year  -> quota * (13 - join_month) / 12, to nearest 0.5
--     (the joining month counts in full)
--
-- `used` is deliberately untouched: days already taken stay taken, so the
-- remaining balance re-derives rather than history being rewritten.
-- Monthly-accrual types are excluded — their `accrued` is what the scheduler
-- has credited so far, not the annual quota.
--
-- Applied automatically on deploy by docker-entrypoint.sh (once), or manually:
--   pnpm --filter @runq/db exec tsx scripts/run-sql.ts migrations/resync-leave-quotas.sql

WITH target AS (
  SELECT
    b.id,
    CASE
      WHEN t.days_per_year <= 0 OR t.days_per_year > 60 THEN t.days_per_year
      WHEN EXTRACT(YEAR FROM e.joining_date) < b.year THEN t.days_per_year
      WHEN EXTRACT(YEAR FROM e.joining_date) > b.year THEN 0
      ELSE ROUND(
        t.days_per_year * (13 - EXTRACT(MONTH FROM e.joining_date)) / 12 * 2
      ) / 2
    END AS accrued
  FROM leave_balances b
  JOIN leave_types t
    ON t.id = b.leave_type_id
   AND t.tenant_id = b.tenant_id
  JOIN employees e
    ON e.id = b.employee_id
  WHERE b.year = EXTRACT(YEAR FROM CURRENT_DATE)
    AND t.accrual_mode <> 'monthly'
)
UPDATE leave_balances b
SET accrued = target.accrued,
    updated_at = now()
FROM target
WHERE b.id = target.id
  AND b.accrued IS DISTINCT FROM target.accrued;
