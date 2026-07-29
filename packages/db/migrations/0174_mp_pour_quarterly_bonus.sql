-- Per-pour quarterly bonus accrual.
--
-- The tier is now read from each pour's own FAT at capture rather than from the
-- farmer's quarterly average. Same blended cost on real data (₹4.74/L either
-- way), but the figure is final the moment the pour is recorded — so the daily
-- receipt, the in-app counter and the cheque can never disagree, and no farmer's
-- payout turns on which side of a tier line a 90-day mean lands.
--
-- Kept OUT of line_amount on purpose. line_amount is what the fortnightly cycle
-- pays (payout.pourAggregates sums it); this accrues to a separate quarterly
-- settlement, so folding it in would pay the bonus twice — once in the cycle and
-- again at quarter end.
ALTER TABLE mp_pours
  ADD COLUMN IF NOT EXISTS quarterly_bonus_amount numeric(15,2) NOT NULL DEFAULT 0;

-- Quarter-close sums this per farmer; the index keeps that scan cheap.
CREATE INDEX IF NOT EXISTS idx_mp_pours_farmer_bonus
  ON mp_pours (tenant_id, farmer_id, collection_date)
  WHERE quarterly_bonus_amount > 0;
