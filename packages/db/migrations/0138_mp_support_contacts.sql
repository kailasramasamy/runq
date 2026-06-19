-- Dhenu: per-tenant support contacts shown on the app's Help & Support screen.
-- Phone/email/WhatsApp are readable by every persona (farmer/operator included)
-- so the in-app contact rows resolve to the tenant's own support desk.
ALTER TABLE mp_gl_settings
  ADD COLUMN IF NOT EXISTS support_phone text,
  ADD COLUMN IF NOT EXISTS support_email text,
  ADD COLUMN IF NOT EXISTS support_whatsapp text;
