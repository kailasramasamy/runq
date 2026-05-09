-- Phase 1 multi-tenant: support both invite flows.
--   new_tenant   — CA invites a new client; accept creates a new tenant + owner,
--                  attaches CA as accountant. (Original Phase 1 behavior.)
--   join_tenant  — Tenant owner invites someone (CA or teammate) to join their
--                  existing tenant. Accept attaches the user as the role on the
--                  invite; does NOT create a new tenant.

CREATE TYPE invite_type AS ENUM ('new_tenant', 'join_tenant');

ALTER TABLE tenant_invites
  ADD COLUMN invite_type invite_type NOT NULL DEFAULT 'new_tenant';

-- Existing rows are CA-led invites (the only flow before this migration).
UPDATE tenant_invites SET invite_type = 'new_tenant' WHERE invite_type IS NULL;
