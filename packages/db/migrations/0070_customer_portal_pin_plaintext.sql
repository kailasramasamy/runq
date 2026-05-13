-- 0070_customer_portal_pin_plaintext.sql
-- Store the portal PIN in plaintext alongside the argon2 hash so the AR person
-- can re-share it with customers who lost it. A 4-digit PIN is not a strong
-- secret; it's a shared knowledge code that's already sent over WhatsApp.

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS portal_pin VARCHAR(6);
