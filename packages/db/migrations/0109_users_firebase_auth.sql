-- Firebase Auth binding for the mobile app. Phase 1 (one-time): user signs in
-- with phone OTP via Firebase, then links Google/Apple — Firebase issues a
-- single uid bound to all linked providers. Server stores that uid here.
-- Phase 2 (every login after): Google/Apple sign-in → same uid → JWT, no SMS.
--
-- `auth_provider` records the last social provider used at bind time, drives
-- the profile "Signed in with…" label and the future admin reset-login flow.
--
-- Partial unique index is migration-only (not declared in drizzle) — drizzle
-- kit push crashes on WHERE clauses (see project_prod_setup.md). Mirrors how
-- the `phone` partial unique index is handled.

ALTER TABLE users ADD COLUMN IF NOT EXISTS firebase_uid varchar(128);
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider varchar(20);

CREATE UNIQUE INDEX IF NOT EXISTS users_firebase_uid_unique
  ON users (firebase_uid) WHERE firebase_uid IS NOT NULL;
