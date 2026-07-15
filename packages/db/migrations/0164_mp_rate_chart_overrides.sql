-- 0164_mp_rate_chart_overrides.sql
-- Per-VMCC and per-farmer rate chart overrides. Pour-time precedence:
-- farmer override -> VMCC override -> node-scoped chart -> tenant-wide chart.
-- A stale/incompatible override silently falls through; pours are never blocked.

BEGIN;

ALTER TABLE mp_nodes   ADD COLUMN IF NOT EXISTS rate_chart_id uuid REFERENCES mp_rate_charts(id);
ALTER TABLE mp_farmers ADD COLUMN IF NOT EXISTS rate_chart_id uuid REFERENCES mp_rate_charts(id);

COMMIT;
