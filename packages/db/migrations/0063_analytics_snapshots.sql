-- Pre-aggregated analytics snapshots. Powers dashboard cards and reports
-- without hitting transactional tables on every page load.
--
-- Design notes:
--   - metric_key is the canonical name of the metric (e.g. 'ar_aging',
--     'top_overdue_customers', 'revenue_vs_expense_12mo'). One row per
--     (tenant, metric, period).
--   - period encodes the bucket the snapshot describes:
--       'live'            — single current-state snapshot per tenant
--       'YYYY-MM-DD'      — a specific date (daily)
--       'YYYY-MM'         — a specific month
--       'YYYY-Wnn'        — a specific ISO week
--       'YYYY'            — a specific year
--     Snapshots are refreshed by background workers (nightly + event-driven).
--   - payload is the metric's serialized result (numbers, arrays, breakdowns).
--     JSONB so different metrics can have different shapes without schema churn.
--   - computed_at lets us age out stale snapshots and show a "last updated"
--     hint in the UI when relevant.
--
-- Refresh strategy:
--   Most metrics are upserted by tenant+metric+period. Event-driven jobs
--   (invoice paid, bill created, JE posted) enqueue a refresh for the
--   affected tenant's relevant metrics; a nightly cron sweeps everything.

CREATE TABLE analytics_snapshots (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  metric_key   VARCHAR(80) NOT NULL,
  period       VARCHAR(20) NOT NULL,
  payload      JSONB NOT NULL,
  computed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_analytics_snapshots_tenant_metric_period
  ON analytics_snapshots(tenant_id, metric_key, period);

CREATE INDEX idx_analytics_snapshots_metric_recent
  ON analytics_snapshots(tenant_id, metric_key, computed_at DESC);

ALTER TABLE analytics_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_snapshots FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_analytics_snapshots ON analytics_snapshots
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
