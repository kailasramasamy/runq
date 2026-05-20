-- HR helpdesk AI agent: per-comment provenance + tenant-level configuration.
-- Comments authored by the agent (either as drafts or auto-sent replies)
-- carry confidence + citations so HR can audit and so the UI can render the
-- draft card. Tenant settings live in tenants.settings.agentSupport JSON.

ALTER TABLE hr_ticket_comments
  ADD COLUMN IF NOT EXISTS is_agent_draft boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS agent_confidence varchar(10),
  ADD COLUMN IF NOT EXISTS agent_citations jsonb,
  ADD COLUMN IF NOT EXISTS agent_metadata jsonb;

CREATE INDEX IF NOT EXISTS idx_tcomment_ticket_draft
  ON hr_ticket_comments (ticket_id) WHERE is_agent_draft = true;
