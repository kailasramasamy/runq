-- Split the contracted gross from the wages actually earned.
--
-- The payslip now leads with the full monthly gross and shows Loss of Pay as a
-- deduction (the conventional Indian layout) instead of quietly pro-rating the
-- earning lines. Statutory contributions, the GL salary expense and the
-- registers must keep following what was actually earned, so that figure gets
-- its own column rather than being inferred from gross.
--
-- Backfilled from gross: existing payslips stored the pro-rated figure there,
-- which is exactly what paid_wages now means. Their gross is restated on the
-- next re-process; approved and closed runs keep the numbers they were
-- approved with.

ALTER TABLE payslips
  ADD COLUMN IF NOT EXISTS paid_wages numeric(12, 2) NOT NULL DEFAULT 0;

UPDATE payslips SET paid_wages = gross WHERE paid_wages = 0;
