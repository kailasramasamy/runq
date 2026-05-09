-- Phase 1 multi-tenant: add client_owner role.
-- Distinguishes a client tenant's owner from runQ-internal owner. Used for
-- tenants created via CA invite — the new tenant's owner gets client_owner
-- (not the same as a self-signup 'owner').
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'client_owner';
