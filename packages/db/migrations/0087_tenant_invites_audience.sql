-- Tenant invites — distinguish CA-style collaboration invites from
-- employee app invites so the accept page can show the right copy
-- ("join their books" vs "access your HR portal") and redirect to the
-- right module after accept.
--
-- finance_collab — default; covers new_tenant CA flows and join_tenant
-- collab invites (accountant / viewer joining another firm's books).
-- employee — created by the HR "Send app invite" flow; the invitee is
-- a `viewer` who matches an `employees` row by email.
ALTER TABLE tenant_invites
  ADD COLUMN IF NOT EXISTS audience VARCHAR(20) NOT NULL DEFAULT 'finance_collab';

-- Constraint after the default so existing rows are populated first.
ALTER TABLE tenant_invites
  DROP CONSTRAINT IF EXISTS tenant_invites_audience_check;
ALTER TABLE tenant_invites
  ADD CONSTRAINT tenant_invites_audience_check
    CHECK (audience IN ('finance_collab', 'employee'));
