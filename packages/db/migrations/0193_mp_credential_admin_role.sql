-- Dhenu app access for web admins.
--
-- mp_credentials was only ever minted as a side effect of creating a farmer or
-- an operator comp-term, so a tenant owner/accountant had no way into the app:
-- login resolves the phone against this table alone and answered "No Dhenu
-- account for this phone". 'admin' is the credential that says "operates the
-- app as a tenant admin" — it never rewrites the user's web role (owner /
-- accountant already map to the admin persona in the app).
ALTER TYPE mp_credential_role ADD VALUE IF NOT EXISTS 'admin';
