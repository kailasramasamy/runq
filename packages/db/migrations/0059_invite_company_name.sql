-- Phase 1 multi-tenant: CA-prefilled company name on new_tenant invites.
-- Lets the inviting CA set the prospect's company name so the accept page
-- doesn't make the prospect retype it.
ALTER TABLE tenant_invites
  ADD COLUMN IF NOT EXISTS company_name varchar(255);
