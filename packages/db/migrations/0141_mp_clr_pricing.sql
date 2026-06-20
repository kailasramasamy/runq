-- Dhenu: CLR-only (lactometer) pricing for VMCCs without a fat/SNF analyzer.
--   * mp_pricing_mode gains 'clr' — a 1-D CLR→₹/L breakpoint table.
--   * mp_nodes.measurement_mode toggles a VMCC between analyzer (fat/SNF) and
--     lactometer (CLR-only). Default analyzer keeps every existing node as-is.
--   * mp_rate_chart_cells gains a nullable `clr` column; fat/snf become nullable
--     so a CLR cell can carry clr alone. Uniqueness is split by cell kind.
ALTER TYPE mp_pricing_mode ADD VALUE IF NOT EXISTS 'clr';

CREATE TYPE mp_measurement_mode AS ENUM ('analyzer', 'lactometer');

ALTER TABLE mp_nodes
  ADD COLUMN IF NOT EXISTS measurement_mode mp_measurement_mode NOT NULL DEFAULT 'analyzer';

ALTER TABLE mp_rate_chart_cells
  ADD COLUMN IF NOT EXISTS clr numeric(5,2);

ALTER TABLE mp_rate_chart_cells ALTER COLUMN fat DROP NOT NULL;
ALTER TABLE mp_rate_chart_cells ALTER COLUMN snf DROP NOT NULL;

-- Replace the old all-rows unique index with kind-scoped partial uniques:
-- matrix cells unique on (fat, snf); clr cells unique on (clr).
DROP INDEX IF EXISTS uq_mp_rate_cells;
CREATE UNIQUE INDEX IF NOT EXISTS uq_mp_rate_cells
  ON mp_rate_chart_cells (rate_chart_id, fat, snf) WHERE clr IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_mp_rate_cells_clr
  ON mp_rate_chart_cells (rate_chart_id, clr) WHERE clr IS NOT NULL;
