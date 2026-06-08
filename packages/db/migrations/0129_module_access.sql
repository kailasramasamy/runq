-- Module access control (per-tenant entitlement + per-user grant).
--
-- tenants.enabled_modules : the ceiling — which functional areas the tenant
--                           has turned on. Defaults to all five so existing
--                           tenants behave exactly as before.
-- user_tenants.modules    : per-user subset of the tenant's enabled modules.
--                           NULL = inherit all enabled modules (owner default).
--
-- Codes are the canonical MODULE_CODES from @runq/types:
--   finance, hr, inventory, purchase, manufacturing
-- Role still governs read/write *within* a module; this controls visibility.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS enabled_modules jsonb NOT NULL
  DEFAULT '["finance","hr","inventory","purchase","manufacturing"]'::jsonb;

ALTER TABLE user_tenants
  ADD COLUMN IF NOT EXISTS modules jsonb;
