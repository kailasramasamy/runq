-- Track the user-selected "current" fiscal year on the tenant.
--
-- The fiscal_periods table already represents individual months/quarters
-- with explicit start/end dates and lock state, but there's no notion of
-- "which FY is the user looking at right now" for the dashboard's FY
-- switcher. We store it as a 4-char short form (e.g. '2526' for
-- FY 2025–26) to match the existing format used in
-- routes/fa/block-of-assets.tsx and routes/reports/fiscal-periods.tsx.
--
-- Nullable: when null, the FE derives the active FY from today's date
-- (Apr–Mar in India). The user only sets this column when they want to
-- pin the dashboard to a prior year for review.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS current_fy VARCHAR(4);
