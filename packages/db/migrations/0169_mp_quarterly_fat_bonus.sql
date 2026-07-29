-- Quarterly FAT bonus + SNF gate — schema only (data lands in 0170).
--
-- Split from the data migration on purpose: a new enum value cannot be USED in
-- the transaction that created it, and run-sql.ts collapses any file containing
-- $$ into a single query. Keeping these plain statements lets 0170 use the new
-- enum value safely.

-- Bonus tier resolved at quarter close on the farmer's best-two-of-three monthly
-- weighted-average FAT — NOT a per-pour bonus. rate-chart.service.bonusFor()
-- must skip this rule type or every pour is paid the bonus twice.
ALTER TYPE mp_rate_rule ADD VALUE IF NOT EXISTS 'quarterly_fat_bonus';

-- Tier floor for quarterly_fat_bonus rows (null for quality_bonus/volume_slab).
ALTER TABLE mp_rate_chart_rules
  ADD COLUMN IF NOT EXISTS fat_min numeric(4,2);

-- Anti-dilution floor, per chart. Below this SNF a pour prices down the sub-3.5
-- taper however good its FAT looks. Null = no gate, so every existing chart is
-- unaffected.
--
-- Explicitly NOT the mp_quality_bands SNF watch floor: that band colour-codes
-- quality, and on Vrindavan's real pours an 8.00 floor gates 26% of all litres
-- and 56% of its highest-volume farmer's (4.38 FAT, naturally low SNF, trending
-- UP week on week — improving herd, not dilution). A gate that docks pay needs
-- its own and far more conservative number.
ALTER TABLE mp_rate_charts
  ADD COLUMN IF NOT EXISTS snf_gate_min numeric(4,2);

-- Set at capture when a pour trips its chart's gate. The quarterly bonus run
-- forfeits the whole quarter for a farmer with any gated pour.
ALTER TABLE mp_pours
  ADD COLUMN IF NOT EXISTS snf_gated boolean NOT NULL DEFAULT false;
