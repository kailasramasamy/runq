-- HR helpdesk escalation tracking.
-- Adds:
--  * 'waiting_human' to hr_ticket_status — set when the agent escalates and
--    HR hasn't replied yet.
--  * hr_tickets.agent_escalated_at — when the most recent agent escalation
--    happened. Surfaced as an "AI flagged" badge in the list/detail UI so
--    HR can prioritise.

DO $$ BEGIN
  ALTER TYPE hr_ticket_status ADD VALUE IF NOT EXISTS 'waiting_human';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE hr_tickets
  ADD COLUMN IF NOT EXISTS agent_escalated_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_tickets_escalated
  ON hr_tickets (tenant_id, agent_escalated_at)
  WHERE agent_escalated_at IS NOT NULL;
