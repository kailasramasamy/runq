-- In-app support system: agentic conversations between users and a Claude
-- agent (Haiku-first, Sonnet fallback) plus a human-handoff path. Phase 1+2
-- ships with read-only tools; Phase 3 adds write actions.

-- ── Enums ──────────────────────────────────────────────────────────────

CREATE TYPE support_conversation_status AS ENUM (
  'open',
  'agent_replied',
  'waiting_human',
  'resolved',
  'closed'
);

CREATE TYPE support_message_role AS ENUM (
  'user',
  'agent',
  'human'
);

CREATE TYPE support_agent_action_status AS ENUM (
  'success',
  'failed',
  'user_rejected',
  'pending_confirmation'
);

-- ── Conversations ──────────────────────────────────────────────────────

CREATE TABLE support_conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  user_id         UUID NOT NULL REFERENCES users(id),
  status          support_conversation_status NOT NULL DEFAULT 'open',
  subject         TEXT,
  agent_summary   TEXT,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  escalated_at    TIMESTAMPTZ,
  resolved_at     TIMESTAMPTZ,
  assigned_to     UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sc_tenant_status      ON support_conversations(tenant_id, status);
CREATE INDEX idx_sc_user_last          ON support_conversations(user_id, last_message_at);
CREATE INDEX idx_sc_status_escalated   ON support_conversations(status, escalated_at);

-- ── Messages ───────────────────────────────────────────────────────────

CREATE TABLE support_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES support_conversations(id) ON DELETE CASCADE,
  role            support_message_role NOT NULL,
  content         TEXT NOT NULL,
  tool_calls      JSONB,
  attachments     JSONB,
  model           VARCHAR(64),
  input_tokens    JSONB,
  output_tokens   JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sm_conversation_created ON support_messages(conversation_id, created_at);

-- ── Agent action audit ─────────────────────────────────────────────────

CREATE TABLE support_agent_actions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES support_conversations(id) ON DELETE CASCADE,
  message_id      UUID REFERENCES support_messages(id) ON DELETE SET NULL,
  tool_name       VARCHAR(64) NOT NULL,
  args            JSONB NOT NULL,
  result          JSONB,
  status          support_agent_action_status NOT NULL DEFAULT 'success',
  duration_ms     JSONB,
  error_details   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_saa_conversation ON support_agent_actions(conversation_id);
CREATE INDEX idx_saa_tool_status  ON support_agent_actions(tool_name, status);
