-- Per-user in-app notifications. Powers the bell-icon dropdown in the
-- topbar. Distinct from agent_events: notifications are addressed to a
-- specific user and have read-state, while agent_events are a tenant-wide
-- audit/history trail.
--
-- Design notes:
--   - type drives the icon (info/ok/warn) and matches the dashboard
--     design's three notification styles.
--   - target_url is where the row routes when clicked (e.g.
--     '/gst', '/ap/bills/<id>'). Optional.
--   - read_at is null until the user marks it read; we keep the timestamp
--     so we can show "marked read 2h ago" if we ever want to.
--   - source is a free-form tag for the producer (e.g. 'gst', 'banking',
--     'agent') so we can group/filter later if needed.

CREATE TYPE notification_type AS ENUM ('info', 'ok', 'warn');

CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  user_id     UUID NOT NULL REFERENCES users(id),
  type        notification_type NOT NULL DEFAULT 'info',
  source      VARCHAR(50) NOT NULL DEFAULT 'system',
  title       TEXT NOT NULL,
  body        TEXT,
  target_url  VARCHAR(500),
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notif_user_unread  ON notifications(user_id, created_at DESC)
  WHERE read_at IS NULL;
CREATE INDEX idx_notif_user_recent  ON notifications(user_id, created_at DESC);
CREATE INDEX idx_notif_tenant       ON notifications(tenant_id, created_at DESC);
