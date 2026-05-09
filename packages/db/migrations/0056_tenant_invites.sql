-- Phase 1 multi-tenant: CA invite flow.
-- A CA generates an invite link → client signs up via link → tenant created
-- → CA auto-attached as accountant in new tenant.

CREATE TABLE IF NOT EXISTS tenant_invites (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token                varchar(64) NOT NULL,
  inviting_user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  inviting_tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role                 user_role NOT NULL DEFAULT 'accountant',
  email                varchar(255),
  note                 varchar(500),
  expires_at           timestamptz NOT NULL,
  accepted_at          timestamptz,
  accepted_tenant_id   uuid REFERENCES tenants(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_invites_token_unique ON tenant_invites(token);
CREATE INDEX IF NOT EXISTS tenant_invites_inviting_user_idx ON tenant_invites(inviting_user_id);
