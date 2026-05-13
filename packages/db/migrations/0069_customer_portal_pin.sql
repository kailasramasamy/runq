-- 0069_customer_portal_pin.sql
-- Add a per-customer portal PIN (argon2 hash) so the AR person can require
-- a shared secret before the portal serves any invoice/statement data.

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS portal_pin_hash    VARCHAR(255),
  ADD COLUMN IF NOT EXISTS portal_pin_set_at  TIMESTAMPTZ;
