-- Dhenu: allow one account to link BOTH Google and Apple. Each social provider
-- is a distinct Firebase uid, so a single mp_credentials row needs many
-- identities. Login keys on this table; bind inserts a row per provider.
-- The legacy mp_credentials.firebase_uid/auth_provider columns are kept as the
-- "most recently linked" audit fields but are no longer used for lookup.
CREATE TABLE IF NOT EXISTS mp_credential_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  credential_id uuid NOT NULL REFERENCES mp_credentials(id),
  firebase_uid varchar(128) NOT NULL,
  provider varchar(20) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- An identity maps to exactly one account; one row per provider per account.
CREATE UNIQUE INDEX IF NOT EXISTS uq_mp_cred_identities_uid
  ON mp_credential_identities (firebase_uid);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mp_cred_identities_cred_provider
  ON mp_credential_identities (credential_id, provider);
CREATE INDEX IF NOT EXISTS idx_mp_cred_identities_cred
  ON mp_credential_identities (credential_id);

-- Backfill the existing single-provider bindings so already-linked users keep
-- logging in without re-binding.
INSERT INTO mp_credential_identities (tenant_id, credential_id, firebase_uid, provider)
SELECT tenant_id, id, firebase_uid, COALESCE(auth_provider, 'google')
FROM mp_credentials
WHERE firebase_uid IS NOT NULL
ON CONFLICT (firebase_uid) DO NOTHING;
