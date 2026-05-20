-- HR helpdesk agent action audit log. One row per tool invocation by the
-- agent. Reads + writes both logged; write actions (submit_leave_request,
-- submit_regularization, etc.) are the critical case since they mutate
-- real records.

CREATE TYPE hr_agent_action_status AS ENUM (
  'success',
  'failed',
  'user_rejected',
  'pending_confirmation'
);

CREATE TABLE hr_agent_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES hr_tickets(id) ON DELETE CASCADE,
  comment_id uuid REFERENCES hr_ticket_comments(id) ON DELETE SET NULL,
  tool_name varchar(64) NOT NULL,
  args jsonb NOT NULL,
  result jsonb,
  status hr_agent_action_status NOT NULL DEFAULT 'success',
  duration_ms integer,
  error_details text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_haa_ticket ON hr_agent_actions(ticket_id);
CREATE INDEX idx_haa_tool_status ON hr_agent_actions(tool_name, status);
