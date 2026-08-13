-- The dates behind a payslip's LOP day count.
--
-- lop_days said "1 day" without saying which, so an employee querying a short
-- salary had nothing to check against. Populated at process time from the
-- month's absent / half-day attendance, and stored rather than derived so an
-- issued payslip stays a faithful record if attendance is edited later.

ALTER TABLE payslips
  ADD COLUMN IF NOT EXISTS lop_dates jsonb NOT NULL DEFAULT '[]'::jsonb;
