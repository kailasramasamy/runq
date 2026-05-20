-- Phone number on users — used by the mobile app's phone+OTP login.
-- Web continues to authenticate via email+password; this column is purely
-- additive. Stored as a free-form varchar (E.164 or local 10-digit), the
-- mobile client is responsible for normalising before sending.
--
-- Partial unique index: phone is optional today (existing users have none),
-- but when set it must be globally unique so a phone resolves to exactly
-- one user across the platform. NULLs are excluded by the WHERE clause.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone VARCHAR(20);

CREATE UNIQUE INDEX IF NOT EXISTS users_phone_unique
  ON users (phone)
  WHERE phone IS NOT NULL;
