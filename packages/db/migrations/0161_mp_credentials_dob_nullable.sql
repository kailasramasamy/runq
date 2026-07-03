-- 0161_mp_credentials_dob_nullable.sql
--
-- DOB is no longer collected (Apple App Store rejection: collecting unnecessary
-- personal data). Authentication is now phone + OTP only; the date_of_birth
-- column is kept for existing rows but made nullable so new credentials can be
-- created without it.
--
-- Apply in native dev via scripts/run-sql.ts (drizzle-kit push is the prod path).

BEGIN;

ALTER TABLE mp_credentials ALTER COLUMN date_of_birth DROP NOT NULL;

COMMIT;
