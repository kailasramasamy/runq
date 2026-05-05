-- Agent events: structured timeline of work done by the runQ Agent (and
-- other automated subsystems) on behalf of a tenant. Surfaces in the
-- dashboard "Agent feed" and powers the "Watch yesterday's run" replay.
--
-- Design notes:
--   - severity drives the icon/colour in the feed (ok/warn/info).
--   - kind is a stable machine identifier (e.g. 'reconcile', 'gst_draft',
--     'flag_invoice', 'send_reminder', 'irn_generate'). New kinds can be
--     added without a migration.
--   - title + detail are pre-rendered for display; we don't need to
--     i18n the agent feed yet.
--   - cta_label + cta_url are optional — when set, the FE shows an inline
--     link (e.g. "Review →" routing to /ap/bills?status=matched).
--   - related_entity_type / related_entity_id give a soft pointer to the
--     domain object the event acted on, for future drill-through.
--   - metadata is a free-form jsonb bag (counts, batch ids, IDs of all
--     affected items, the prompt run, tool call list, etc).

CREATE TYPE agent_event_severity AS ENUM ('ok', 'warn', 'info');

CREATE TABLE agent_events (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  occurred_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  kind                  VARCHAR(50) NOT NULL,
  severity              agent_event_severity NOT NULL DEFAULT 'info',
  title                 TEXT NOT NULL,
  detail                TEXT,
  cta_label             VARCHAR(50),
  cta_url               VARCHAR(500),
  related_entity_type   VARCHAR(50),
  related_entity_id     UUID,
  metadata              JSONB,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agent_events_tenant_time   ON agent_events(tenant_id, occurred_at DESC);
CREATE INDEX idx_agent_events_tenant_kind   ON agent_events(tenant_id, kind, occurred_at DESC);
CREATE INDEX idx_agent_events_tenant_severity ON agent_events(tenant_id, severity, occurred_at DESC);
