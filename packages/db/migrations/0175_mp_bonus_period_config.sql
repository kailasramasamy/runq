-- Bonus accrual period, per tenant.
--
-- Mirrors the existing cycle cadence (cycle_days from cycle_anchor_date): a
-- length in months counted from an anchor, so periods roll without a scheduler
-- deciding boundaries. Vrindavan's first period is 2026-08-01 → 2026-10-31,
-- which is NOT a calendar quarter — hence an anchor rather than Q1..Q4.
--
-- Needed before the quarter-close run: the daily receipt quotes a
-- "quarter to date" total and it has to mean the same window the cheque covers.
ALTER TABLE mp_gl_settings
  ADD COLUMN IF NOT EXISTS bonus_period_months integer NOT NULL DEFAULT 3;
ALTER TABLE mp_gl_settings
  ADD COLUMN IF NOT EXISTS bonus_anchor_date date;

-- Vrindavan: anchor the first accrual period to the chart's go-live.
UPDATE mp_gl_settings SET bonus_anchor_date = '2026-08-01'
 WHERE bonus_anchor_date IS NULL
   AND tenant_id = (SELECT id FROM tenants WHERE name = 'Vrindavan Dairy LLP');
