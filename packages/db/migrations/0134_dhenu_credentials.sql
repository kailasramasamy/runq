-- 0134_dhenu_credentials.sql
--
-- Independent Dhenu (milk-procurement) login identity. Unlike HR mobile auth,
-- this NEVER touches `employees`: farmers and field operators bind here by
-- phone + DOB (DDMMYY), then link Google/Apple. On the first successful login a
-- `users` row (role `farmer` | `field_operator`) is minted/linked for the JWT +
-- tenant membership, and `user_id` points at it.
--
-- `bind_attempts` throttles the DOB gate (5 failed tries → locked, admin reset).
-- `firebase_uid` is set on the one-time social bind; its partial-unique index
-- lives here (drizzle-kit push chokes on WHERE clauses, per project_prod_setup).

DO $$ BEGIN
  CREATE TYPE mp_credential_role AS ENUM ('farmer', 'field_operator');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS mp_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  phone varchar(20) NOT NULL,
  date_of_birth date NOT NULL,
  role mp_credential_role NOT NULL,
  farmer_id uuid REFERENCES mp_farmers(id),
  user_id uuid REFERENCES users(id),
  firebase_uid varchar(128),
  auth_provider varchar(20),
  bind_attempts integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_mp_credentials_tenant_phone ON mp_credentials (tenant_id, phone);
CREATE INDEX IF NOT EXISTS idx_mp_credentials_phone ON mp_credentials (phone);
CREATE INDEX IF NOT EXISTS idx_mp_credentials_farmer ON mp_credentials (farmer_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mp_credentials_firebase_uid
  ON mp_credentials (firebase_uid) WHERE firebase_uid IS NOT NULL;
